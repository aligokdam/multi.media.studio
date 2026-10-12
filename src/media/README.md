# `src/media/`: imported media

`registry.js` owns everything about the files in the open project: Blobs, object
URLs, decoded images, audio buffers, thumbnails and waveform peaks. The project
JSON only stores metadata.

## Import rules

- Accepted video: MP4, M4V, MOV, WebM, MKV, OGV.
- Accepted audio: MP3, WAV, M4A, M4B, AAC, OGG, Opus, FLAC, WebM audio, AIFF, CAF, MKA.
  An MP4 or WebM file without a video stream is imported as audio.
- Accepted images: PNG, JPEG, WebP, GIF, AVIF, BMP, HEIC (when the browser can decode it).
- Each file is checked by extension and MIME type, size (up to 4 GB) and then
  actually probed with mediabunny or a media element. A file that cannot be
  read is rejected with a clear message. Formats the browser cannot play, such
  as AIFF in some browsers, are reported instead of being accepted silently.
- The same file (name, size and modification date) is stored only once per project.
- Files are written to local storage (`storage/blobs.js`). Nothing is uploaded.
