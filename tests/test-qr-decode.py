#!/usr/bin/env python3
"""Decode tests/qr-test.pbm with OpenCV and compare to the expected text.
Run: ~/.streamclips/venv/bin/python tests/test-qr-decode.py
"""
import sys
from pathlib import Path

import cv2
from PIL import Image

HERE = Path(__file__).resolve().parent
pbm = HERE / "qr-test.pbm"
expected = (HERE / "qr-test-text.txt").read_text().strip()

img = Image.open(pbm).convert("L")
png = HERE / "qr-test.png"
img.save(png)

detector = cv2.QRCodeDetector()
data, points, _ = detector.detectAndDecode(cv2.imread(str(png)))
print("expected:", expected)
print("decoded :", data)
if data == expected:
    print("QR DECODE PASS — our encoder produces a real, scannable QR code")
    sys.exit(0)
print("QR DECODE FAIL")
sys.exit(1)
