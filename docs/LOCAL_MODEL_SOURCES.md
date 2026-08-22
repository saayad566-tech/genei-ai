# Local Model and Tool Source Notes

These notes preserve the official source consulted while designing the in-app capability catalog.

## HunyuanVideo

Official repository: https://github.com/Tencent-Hunyuan/HunyuanVideo

The repository describes HunyuanVideo as an open-source video foundation model. Its published requirements indicate that local execution needs an NVIDIA CUDA-capable GPU and large GPU memory; the repository states that it was tested on Linux and lists minimum memory requirements in the tens of gigabytes for its high-resolution configurations. Genei should therefore label it as a high-end local option and show a cloud/provider alternative on ordinary Windows computers instead of presenting it as universally compatible.

## Catalog policy

Every model or tool shown as installable must retain its official source URL, current release or model-card URL, license information, operating-system support, hardware requirements, download size, checksum, and supported Genei pipeline stages. Catalog items must be marked as verified only after their official source and package metadata have been checked. Large model files should remain optional downloads rather than being bundled into the base desktop installer.
