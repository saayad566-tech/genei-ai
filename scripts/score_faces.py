#!/usr/bin/env python3
"""
Local face-identity scorer.

Compares two images and prints a similarity score as JSON on stdout.

Why this exists as a subprocess rather than a service: the app already shells out to Piper
for speech, and a 200 MB ONNX pair loaded once per request would cost more than the request.
One process per comparison keeps the app dependency-free — no Python package in the Node tree,
no daemon to supervise.

Models: insightface buffalo_l (SCRFD detection + ArcFace recognition), 512-d embeddings,
compared by cosine similarity mapped to 0-100.

Honest about what it can and cannot do:
  - It reports how many faces it found. More than one means the score describes one of them
    and nobody knows which, so the caller is told.
  - No face found is reported as such, never as a score of zero.
  - A score is a similarity signal, not a guarantee that two faces are the same person.

Usage:
  score_faces.py --reference ref.jpg --take take.jpg --model-dir DIR
"""

import argparse
import json
import sys

import numpy as np

# SCRFD input size. The model is fully convolutional, so this is a scale choice, not a
# constraint — 640 matches the upstream default and keeps small faces detectable.
DET_SIZE = 640
DET_THRESHOLD = 0.5
NMS_THRESHOLD = 0.4
EMBED_SIZE = 112


def load_onnx(path):
    import onnxruntime as ort

    opts = ort.SessionOptions()
    # One thread per session: this runs per request, and thread thrash costs more than it saves.
    opts.intra_op_num_threads = 1
    return ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])


def letterbox(image, size):
    """Resize keeping aspect ratio, pad to a square. Returns the image and the transform."""
    import cv2

    h, w = image.shape[:2]
    scale = size / max(h, w)
    nh, nw = int(round(h * scale)), int(round(w * scale))
    resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.zeros((size, size, 3), dtype=np.uint8)
    canvas[:nh, :nw] = resized
    return canvas, scale


def detect_faces(det_session, image):
    """Run SCRFD and return face boxes as (x1, y1, x2, y2, score) in original coordinates.

    The model emits NINE tensors, in a fixed order: three strides (8, 16, 32) each
    contributing a score map [N,1], a bbox map [N,4] and a keypoint map [N,10].

    Two details are easy to get wrong and both were, in the first version of this function:

      * The pairing is positional (0-2 scores, 3-5 bboxes, 6-8 keypoints), not a stride
        computed from the tensor index. Grouping by `index % 3` pairs a score with the wrong
        stride and detects nothing.
      * The bbox values are in STRIDE units, not pixels. Anchor centres are on a grid, so the
        absolute pixel box is `(centre + offset) * stride`.
    """
    import cv2

    padded, scale = letterbox(image, DET_SIZE)
    blob = padded.astype(np.float32).transpose(2, 0, 1)[None]
    # SCRFD expects BGR minus 127.5 divided by 128, matching the reference implementation.
    blob = (blob - 127.5) / 128.0

    outputs = det_session.run(None, {det_session.get_inputs()[0].name: blob})
    strides = [8, 16, 32]

    boxes = []
    for index, stride in enumerate(strides):
        scores = np.asarray(outputs[index]).reshape(-1)
        bboxes = np.asarray(outputs[index + len(strides)]).reshape(-1, 4)

        grid = DET_SIZE // stride
        # Anchor centres: one per grid cell, (x + 0.5) * stride.
        centres = np.stack(
            np.meshgrid(np.arange(grid), np.arange(grid), indexing="xy"), axis=-1
        ).reshape(-1, 2).astype(np.float32)
        centres = (centres + 0.5) * stride

        # SCRFD places TWO anchors per grid cell, so the score map has twice as many rows as
        # there are cells. Without repeating each centre, anchor i is paired with the centre
        # of cell i/2 and every box lands in the wrong place — which is why a clear frontal
        # face produced zero detections at first.
        per_cell = max(1, scores.shape[0] // max(1, centres.shape[0]))
        if per_cell > 1:
            centres = np.repeat(centres, per_cell, axis=0)

        count = min(scores.shape[0], bboxes.shape[0], centres.shape[0])
        for i in range(count):
            if scores[i] < DET_THRESHOLD:
                continue
            cx, cy = centres[i]
            dx1, dy1, dx2, dy2 = bboxes[i] * stride
            boxes.append(
                [
                    (cx - dx1) / scale,
                    (cy - dy1) / scale,
                    (cx + dx2) / scale,
                    (cy + dy2) / scale,
                    float(scores[i]),
                ]
            )

    if not boxes:
        return []

    boxes = np.array(boxes, dtype=np.float32)
    keep = nms(boxes, NMS_THRESHOLD)
    return boxes[keep]


def nms(boxes, threshold):
    """Greedy non-maximum suppression over (x1, y1, x2, y2, score)."""
    x1, y1, x2, y2, scores = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3], boxes[:, 4]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / np.maximum(1e-9, areas[i] + areas[order[1:]] - inter)
        order = order[1:][iou <= threshold]
    return keep


def embed(rec_session, image, box):
    """Crop the face and return a normalised 512-d embedding."""
    import cv2

    x1, y1, x2, y2 = [int(max(0, v)) for v in box[:4]]
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    crop = cv2.resize(crop, (EMBED_SIZE, EMBED_SIZE), interpolation=cv2.INTER_LINEAR)
    blob = crop.astype(np.float32).transpose(2, 0, 1)[None]
    blob = (blob - 127.5) / 127.5
    out = rec_session.run(None, {rec_session.get_inputs()[0].name: blob})[0].reshape(-1)
    norm = np.linalg.norm(out)
    if norm == 0:
        return None
    return out / norm


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", required=True)
    parser.add_argument("--take", required=True)
    parser.add_argument("--model-dir", required=True)
    args = parser.parse_args()

    try:
        import cv2  # noqa: F401
    except ImportError:
        print(json.dumps({"error": "opencv-python is required: pip install opencv-python-headless"}))
        return 1

    try:
        det = load_onnx(f"{args.model_dir}/detection.onnx")
        rec = load_onnx(f"{args.model_dir}/arcface.onnx")
    except Exception as exc:  # noqa: BLE001 - reported to the caller as JSON
        print(json.dumps({"error": f"models could not be loaded: {exc}"}))
        return 1

    import cv2

    def first_face(path):
        image = cv2.imread(path)
        if image is None:
            return None, 0
        faces = detect_faces(det, image)
        if len(faces) == 0:
            return None, 0
        # Largest face wins: in a portrait it is the subject, not a bystander.
        largest = max(faces, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        return embed(rec, image, largest), len(faces)

    ref_vec, ref_faces = first_face(args.reference)
    take_vec, take_faces = first_face(args.take)

    if ref_vec is None:
        print(json.dumps({"error": "no face found in the reference image", "faces": ref_faces}))
        return 0
    if take_vec is None:
        print(json.dumps({"error": "no face found in the take", "faces": take_faces}))
        return 0

    cosine = float(np.dot(ref_vec, take_vec))
    # Cosine -1..1 mapped to 0..100. Two unrelated faces sit near 0 (score 50), the same face
    # near 1 (score ~100).
    score = round(((cosine + 1) / 2) * 100, 1)

    print(
        json.dumps(
            {
                "score": score,
                "cosine": round(cosine, 4),
                "faces": max(ref_faces, take_faces),
                "referenceFaces": ref_faces,
                "takeFaces": take_faces,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
