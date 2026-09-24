#!/usr/bin/env python3
"""Render the cockpit voice (altitude callouts, GPWS warnings, crew lines) to small MP3 clips.

The game plays these through Web Audio, like its other sounds: browsers' built-in speech differs
from one to the next and is unreliable on iPhone. The phrases and the voice are in
audio/voice/phrases.json; this writes audio/voice/<slug>.mp3 for each (slug: lower case, words
joined by '-').

Voice: Kokoro (https://github.com/thewh1teagle/kokoro-onnx, Apache-2.0 model). Setup:
    python3 -m venv venv && ./venv/bin/pip install kokoro-onnx soundfile lameenc
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
    ./venv/bin/python tools/make-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin
If espeak-ng reports that it cannot find its data under a /home/runner/work/... path (the path
compiled into the espeakng-loader wheel), link that path to the venv's
espeakng_loader/espeak-ng-data directory.

Each clip is trimmed, band-limited like a flight-deck speaker (about 250 Hz to 5 kHz, which also
keeps it clear on a phone speaker), normalised, and encoded as 24 kHz mono MP3 at 48 kbit/s.
"""
import argparse, json, math, os, re
import numpy as np
import lameenc
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'audio', 'voice')


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def biquad(x, kind, f0, fs, q=0.707):
    """RBJ biquad (high- or low-pass), applied forwards and backwards (no phase shift)."""
    w = 2 * math.pi * f0 / fs
    alpha = math.sin(w) / (2 * q)
    c = math.cos(w)
    if kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else:
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    a = [1 + alpha, -2 * c, 1 - alpha]
    b = [v / a[0] for v in b]; a = [1, a[1] / a[0], a[2] / a[0]]

    def run(s):
        y = np.zeros_like(s); x1 = x2 = y1 = y2 = 0.0
        for i, v in enumerate(s):
            o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
            x2, x1, y2, y1 = x1, v, y1, o
            y[i] = o
        return y
    return run(run(x)[::-1])[::-1]


def trim(x, fs, floor_db=-42, pad=0.03):
    level = np.abs(x)
    thr = level.max() * 10 ** (floor_db / 20)
    idx = np.where(level > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * fs)); b = min(len(x), idx[-1] + int(pad * fs))
    return x[a:b]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--voices', required=True)
    args = ap.parse_args()
    spec = json.load(open(os.path.join(OUT, 'phrases.json')))
    tts = Kokoro(args.model, args.voices)
    for text in spec['phrases']:
        samples, fs = tts.create(text, voice=spec['voice'], speed=spec['speed'], lang='en-us')
        x = trim(np.asarray(samples, dtype=np.float64), fs)
        x = biquad(x, 'hp', 250, fs)
        x = biquad(x, 'lp', 5000, fs)
        x = x / (np.abs(x).max() + 1e-9) * 0.89                    # -1 dBFS peak
        fade = int(0.01 * fs); ramp = np.linspace(0, 1, fade)
        x[:fade] *= ramp; x[-fade:] *= ramp[::-1]
        pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
        enc = lameenc.Encoder()
        enc.set_bit_rate(48); enc.set_in_sample_rate(fs); enc.set_channels(1); enc.set_quality(2)
        mp3 = enc.encode(pcm) + enc.flush()
        path = os.path.join(OUT, slug(text) + '.mp3')
        open(path, 'wb').write(mp3)
        print(f'{slug(text):40s} {len(x) / fs:5.2f} s  {len(mp3) / 1024:5.1f} KB')


if __name__ == '__main__':
    main()
