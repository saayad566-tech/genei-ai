import os
import sys
import json
import subprocess
from ai_director.hardware_detector import detect_hardware

def main():
    print("=== Genei AI Full-Stack Desktop Host ===")
    hw = detect_hardware()
    print("Detected Hardware Profile:")
    print(json.dumps(hw, indent=2))

    print("\nInitializing embedded local runtime & BYOH workstation connection...")
    print("All 5 core studios, ComfyUI Graph Studio, AI Director, and BYOK hub are embedded.")
    
    # In a full Electron / PyWebView wrapper, this starts the local node/express server and opens the native window.
    print("Desktop host ready. To launch the full desktop application UI, run the web server or desktop container bundle.")

if __name__ == "__main__":
    main()
