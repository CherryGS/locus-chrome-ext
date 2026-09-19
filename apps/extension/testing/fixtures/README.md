# Synthetic binary fixtures

`black-frame.png` is a 16 by 16 black image. `black-frame.mp4` is a tiny generated
black H.264 video. Both are disposable synthetic test inputs produced with local
FFmpeg; neither contains downloaded media, a real person's image, credentials,
or user data. The browser harness uses them to compare actual acquired/exported
bytes and exercise supported image/video encodings.

The PNG was generated with:

```text
ffmpeg -f lavfi -i color=c=black:s=16x16 -frames:v 1 -update 1 black-frame.png
```

The one-frame MP4 was generated during the isolated integration probe and copied
here as a maintained test fixture. It has no product/runtime use.
