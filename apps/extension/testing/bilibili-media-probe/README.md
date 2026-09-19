# Bilibili encoded-track feasibility probe

This manual experiment builds a separate temporary MV3 extension and launches a
disposable Chrome for Testing profile. It is not Bilibili product integration.
It does not discover a selected part, establish sign-in, choose quality, acquire
metadata/cover, or alter the production manifest, runtime, database or build.

## Run

Use Node/pnpm versions pinned by the repository, Chrome for Testing, and local
`ffmpeg`/`ffprobe` on PATH. No personal browser/profile is used.

```powershell
$env:LOCUS_CHROME_PATH = 'C:/path/to/chrome-for-testing/chrome.exe'
pnpm --dir apps/extension probe:bilibili-media
```

The runner generates three seconds of synthetic AVC with B-frames, explicitly
declared BT.709 limited-range color, and AAC, then
tests missing required audio, truncated MP4 input, and explicit cancellation.
An additional three-second unspecified-color fixture retains the normalization
diagnostic with complete packet, frame-hash and color-attribute evidence.
It prints the path to sanitized `evidence.json` and per-case statuses. Temporary
inputs, assembled MP4s, ZIPs, playback screenshots, extension and profile stay in
the reported temporary directory for independent inspection.

Optional local reference tracks are read without copying them into the repository:

```powershell
$env:LOCUS_PROBE_VIDEO = 'C:/temporary-inputs/video.m4s'
$env:LOCUS_PROBE_AUDIO = 'C:/temporary-inputs/audio.m4s'
$env:LOCUS_PROBE_DURATION = '182.461'
pnpm --dir apps/extension probe:bilibili-media
```

For a separate short-lived CDN experiment, also set `LOCUS_PROBE_URL_CONFIG` to a
temporary JSON file containing `videoUrl` and `audioUrl`. Local reference tracks
are required for independent packet comparison. URL config and real media must
never be committed. URLs are not printed or written into evidence. A `sourcePage`
field, if present, is unused. No cookies, account data, credentials, authorization
headers or private browser files are read or copied.

Direct extension-origin GET uses `credentials: omit` and refuses redirects. If
it fails, the temporary extension alone tries a fixed `https://www.bilibili.com/`
Referer using two DNR session rules. Each rule matches exactly one supplied media
URL, its CDN host, GET/XHR, and this disposable extension's initiator. Only this
URL-config mode adds `declarativeNetRequestWithHostAccess` to the temporary manifest.
Rules are removed in `finally`, and the remaining count must be zero. This is
access evidence, not a production permission decision. HTTP MIME is not treated
as container proof; the bounded MP4 parser validates the actual track data.

## Checks and interpretation

The offscreen document uses Mediabunny's encoded packet sinks and sources,
awaiting every write for backpressure. It passes decoder configurations and
packets in decode order without changing PTS/duration. Constructor guards fail
the run if the assembly context invokes a WebCodecs encoder or decoder. MP4 output
is bounded, and unfinished output/inputs are canceled/disposed on errors.

The existing `ResultDatabase` commits the assembled Blob in a disposable named
database. The runner closes the offscreen execution context before reopening the
Blob in the viewer. The existing `createArchive` writes actual JSON/JSONL/file ZIP
content. Extracted ZIP video bytes must match the reopened Blob. Chrome playback
checks decoded frames at the start, midpoint and near the end; audio membership
and decoded-audio bytes are recorded. External FFmpeg decodes the complete file.
This does not exercise Chrome's native download lifecycle, already covered by the
production browser smoke suite.

Independent ffprobe checks compare codec, every compressed packet hash/count,
PTS, DTS, duration, profile/color attributes and decoder-configuration hash.
External FFmpeg compares every decoded video's frame hash in presentation order,
separately from packet hashes. Evidence distinguishes:

- `pass`: packet/codec identity and timing preserved within 2 ms quantization.
- `pass-with-dts-rebase`: PTS/duration and encoded packets are preserved, but the
  muxer reconstructs a constant decode-time origin. The measured delta remains
  visible; this does not claim exact original DTS identity.
- `configuration-rewrite-observed`: packets and playback checks pass, but the
  container codec-configuration hash differs. This remains an explicit evidence
  gap for configuration preservation, not an unqualified pass.
- `metadata-normalization-observed`: packet/frame preservation succeeds but
  profile/color attributes differ; both source and output attributes remain visible.
- `timing-or-packet-gap`, `unsupported-or-failed`, or `failed`: the named stage did
  not establish the requested preservation/access capability.

The initial AV1/AAC sample preserves all encoded packets and fully decodes, while
Mediabunny reduces its AV1 container configuration from 107 bytes to a 4-byte
header. An initial AVC fixture with unspecified color range gained a limited-range
container declaration from the library's decoder configuration; unknown color
metadata preservation is therefore also unproven and remains a maintained
diagnostic alongside the explicitly declared baseline. The AVC B-frame fixture has a constant
one-frame DTS shift with unchanged PTS/durations. None of these findings is hidden
by transcoding or vendor-code changes.
These are bounded sample findings, not universal source/codec support.

The additional real 1080p AVC/AAC sample preserves all 5,469 video and 7,855 audio
packet hashes, decoder configuration and reported color/profile attributes. All
5,469 decoded video-frame hashes agree. Its video PTS/DTS quantization is at most
7 microseconds and packet-duration difference at most 0.993 milliseconds; audio
timings agree. This is a separate same-quality source representation, not a
transcoded repair of AV1. Both real samples passed retained Blob reopening,
byte-identical ZIP inclusion, Chrome start/mid/end playback and full external decode.

Limits: 64 MiB per input, 160 MiB output address space, 320 MiB cumulative output
writes, 100,000 packets per track, 600-second expected duration, 120-second
assembly/fetch deadline and 130-second host watchdog. Expected track endpoints
must be within 300 ms of the supplied duration. Playback/packet checks are
independent of that coarse admission check. This in-memory fixture design is not
a resource strategy for full-length production captures.

Fatal/synthetic failures exit nonzero. Optional real-source failures remain
separately reported evidence and do not convert synthetic success into live-source
support. Signed URL expiration, missing session/entitlement and quality selection
must be assessed independently by the source probe.

## Candidate and license

Mediabunny **1.58.1**, by Vanilagy and contributors, is pinned as an experimental
development dependency under **MPL-2.0**. Its source is unmodified; the temporary
extension receives the package license, and bundled source retains its notices.
It is not imported by any production entrypoint.

- [Encoded media sources](https://mediabunny.dev/guide/media-sources)
- [Encoded media sinks](https://mediabunny.dev/guide/media-sinks)
- [Mediabunny source](https://github.com/Vanilagy/mediabunny)
- [MPL-2.0](https://www.mozilla.org/MPL/2.0/)
- [Chrome DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

Message handlers deliberately use `sendResponse` plus `return true`, compatible
with the product's Chrome 116 floor. The experiment itself reports actual CfT
behavior rather than promising compatibility with every supported browser.
