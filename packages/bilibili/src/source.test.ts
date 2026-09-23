import { describe, expect, it } from 'vitest';
import { assignment, projectBilibili } from './projection';
import { normalizeBilibili, selectBilibili } from './source';
import { partUrl, bilibiliResource } from './urls';
const url = 'https://www.bilibili.com/video/BV145PxzCEoE/?p=2';
function fixture() {
  const cid = '36531930223';
  const media = (id: number, codec: string, width = 580, height = 1280) => ({ id, codecs: codec, width, height, bandwidth: id * 1000, baseUrl: `https://synthetic.bilivideo.com/upgcxcode/23/02/${cid}/${cid}-1-${id}.m4s?private=do-not-retain` });
  const initial = { bvid: 'BV145PxzCEoE', aid: '116182891959963', cid, p: 2, user: { private: 'never project' }, videoData: { bvid: 'BV145PxzCEoE', cid: '36508468243', title: 'Synthetic title', desc: 'One\n&amp; two', desc_v2: [{ type: 1, raw_text: 'One\n& two' }], owner: { mid: '388999597', name: 'Synthetic uploader' }, pic: 'http://i0.hdslb.com/bfs/archive/synthetic.jpg', pubdate: 1710000000, rights: { ugc_pay: 0, ugc_pay_preview: 0, is_stein_gate: 0 }, pages: [{ page: 1, cid: '36508468243', duration: 66, part: 'First' }, { page: 2, cid, duration: 27, part: 'Second' }] } };
  const play = { code: 0, data: { timelength: 26422, accept_quality: [64, 32], support_formats: [{ quality: 64 }, { quality: 32 }], dash: { video: [media(64, 'avc1.640028'), media(32, 'avc1.64001F', 386, 854)], audio: [media(30216, 'mp4a.40.2'), media(30280, 'mp4a.40.2')] } } };
  return { initial, play, candidate: () => normalizeBilibili(projectBilibili(initial, play, url, true), url) };
}
describe('Bilibili initial current-part source', () => {
  it('binds root P2 CID independently of parent first CID and retains only safe selected metadata', () => { const f = fixture(), c = f.candidate(), r = selectBilibili(c, ['media-1', 'media-2'], 'result'); expect(c.text).toBe('Synthetic title\n\nOne\n& two'); expect(c.media[1]!.tracks?.video.quality).toBe(64); expect(c.media[1]!.tracks?.audio?.quality).toBe(30280); expect(JSON.stringify(r)).not.toContain('private='); expect(JSON.stringify(r)).not.toContain('never project'); expect(JSON.stringify(r)).toContain('36531930223'); });
  it('retains numeric video filename suffixes independently of an unsuffixed audio track', () => {
    const f = fixture();
    for (const track of f.play.data.dash.video) track.baseUrl = track.baseUrl.replace('-1-', '_t6-1-');
    const candidate = f.candidate(), tracks = candidate.media[1]!.tracks;
    expect(tracks?.video.quality).toBe(64); expect(tracks?.video.url).toContain('_t6-1-64.m4s');
    expect(tracks?.audio?.url).not.toContain('_t6');
    const retained = JSON.stringify(selectBilibili(candidate, ['media-1', 'media-2'], 'result'));
    expect(retained).toContain('_t6-1-64.m4s'); expect(retained).not.toContain('private=');
  });
  it('selects and retains qe-marked video and audio under the same part CID', () => {
    const f = fixture();
    for (const track of [...f.play.data.dash.video, ...f.play.data.dash.audio]) track.baseUrl = track.baseUrl.replace('-1-', '_qe1-1-');
    const candidate = f.candidate(), tracks = candidate.media[1]!.tracks;
    expect(tracks?.video.quality).toBe(64); expect(tracks?.audio?.quality).toBe(30280);
    const retained = JSON.stringify(selectBilibili(candidate, ['media-1', 'media-2'], 'result'));
    expect(retained).toContain('_qe1-1-64.m4s'); expect(retained).toContain('_qe1-1-30280.m4s');
    expect(retained).not.toContain('private=');
  });
  it('captures removed script text as bounded JSON without evaluating trailing page code', () => { expect(assignment('window.__INITIAL_STATE__={"p":2};document.currentScript.remove()', '__INITIAL_STATE__')).toEqual({ p: 2 }); expect(() => assignment('window.__playinfo__={"p":(()=>2)()}', '__playinfo__')).toThrow(); });
  it('requires explicit login and exact root/selected-part binding', () => { const f = fixture(); expect(() => projectBilibili(f.initial, f.play, url, false)).toThrow('Sign in'); f.initial.cid = '36508468243'; expect(f.candidate).toThrow('CID'); f.initial.cid = '36531930223'; f.initial.p = 1; expect(f.candidate).toThrow('selected part'); });
  it('rejects unsafe numeric IDs before attribution', () => { const f = fixture(); Object.assign(f.initial, { aid: 9007199254740992 }); expect(f.candidate).toThrow('identifier'); });
  it('preserves explicit empty text and does not reinterpret absent/unknown description as empty', () => { const f = fixture(); Object.assign(f.initial.videoData, { desc: '', desc_v2: null }); expect(f.candidate().text).toBe('Synthetic title\n\n'); Object.assign(f.initial.videoData, { desc: 'excerpt', desc_v2: [{ type: 2, raw_text: 'unknown' }] }); const c = f.candidate(); expect(c.payload).toBeNull(); expect(c.media[1]!.tracks).toBeDefined(); });
  it('preserves mixed text and mentions through projection, normalization and retained metadata', () => {
    const f = fixture();
    Object.assign(f.initial.videoData, { desc: 'collapsed excerpt', desc_v2: [
      { type: 1, raw_text: 'Thanks & credits\nWith ' },
      { type: 2, raw_text: 'Synthetic collaborator', biz_id: 102595443, unrelated: 'not-projected' },
      { type: 1, raw_text: ' for the edit.\nhttps://example.com/?a=1&b=2' },
      { type: 2, raw_text: 'Another collaborator', biz_id: '123' },
    ] });
    const projected = projectBilibili(f.initial, f.play, url, true);
    expect(JSON.stringify(projected)).not.toContain('not-projected');
    const candidate = normalizeBilibili(projected, url);
    const description = 'Thanks & credits\nWith @Synthetic collaborator  for the edit.\nhttps://example.com/?a=1&b=2@Another collaborator ';
    expect(candidate.textFailure).toBeNull();
    expect(candidate.text).toBe(`Synthetic title\n\n${description}`);
    const retained = selectBilibili(candidate, ['media-1', 'media-2'], 'mentions');
    expect(retained.records[0]).toMatchObject({ acquisition: { state: 'acquired' }, payload: { description } });
  });
  it.each([
    { type: 99, raw_text: 'unsupported', biz_id: 123 },
    { type: 2, raw_text: 'missing identity' },
    { type: 2, raw_text: 'invalid identity', biz_id: 0 },
    { type: 2, raw_text: '', biz_id: 123 },
    { type: 2, raw_text: null, biz_id: 123 },
  ])('does not silently drop an unsupported or malformed description segment: %j', segment => {
    const f = fixture();
    Object.assign(f.initial.videoData, { desc: 'excerpt', desc_v2: [{ type: 1, raw_text: 'Valid prefix' }, segment] });
    const candidate = f.candidate();
    expect(candidate.payload).toBeNull(); expect(candidate.text).toBeNull();
    expect(candidate.textFailure).toContain('BILI_METADATA_INCOMPLETE');
    expect(candidate.media[1]!.tracks).toBeDefined();
  });
  it('keeps independently complete metadata when video access/completeness fails', () => { const f = fixture(); f.initial.videoData.rights.ugc_pay_preview = 1; const c = f.candidate(); expect(c.payload).not.toBeNull(); expect(c.media[1]!.reason).toContain('preview'); });
  it.each([true, 1, 'unknown'])('rejects an upower preview flag %s as video-only limitation', flag => { const f = fixture(); Object.assign(f.initial.videoData, { is_upower_preview: flag }); const c = f.candidate(); expect(c.payload).not.toBeNull(); expect(c.media[1]!.tracks).toBeUndefined(); });
  it('does not attribute stale precise duration or throw on invalid auxiliary publication dates', () => { const f = fixture(); f.play.data.timelength = 10000; f.initial.videoData.pubdate = Number.MAX_VALUE; const c = f.candidate(); expect(c.media[1]!.reason).toContain('duration'); expect(c.payload).toMatchObject({ part: { duration: 27, durationPrecision: 'coarse-seconds' }, publishedAt: null }); });
  it('rejects foreign CID tracks even when shape and quality appear valid', () => { const f = fixture(); f.play.data.dash.video[0]!.baseUrl = f.play.data.dash.video[0]!.baseUrl.replaceAll('36531930223', '36508468243'); expect(f.candidate().media[1]!.reason).toContain('CID'); });
  it('uses a source-supplied approved mirror when the primary is an ungranted MCDN origin', () => {
    const f = fixture();
    for (const track of [...f.play.data.dash.video, ...f.play.data.dash.audio]) {
      const approved = track.baseUrl, path = new URL(approved).pathname;
      track.baseUrl = `https://synthetic.mcdn.bilivideo.cn:8082/v1/resource${path}`;
      Object.assign(track, { [track.id === 64 ? 'backup_url' : 'backupUrl']: [`https://synthetic.edge.mountaintoys.cn:4483${path}`, approved] });
    }
    const candidate = f.candidate(), selected = candidate.media[1]!.tracks;
    expect(selected?.video).toMatchObject({ quality: 64, width: 580, height: 1280 });
    expect(selected?.audio?.quality).toBe(30280);
    expect(selected?.video.url).toContain('https://synthetic.bilivideo.com/');
    expect(selected?.audio?.url).toContain('https://synthetic.bilivideo.com/');
    const saved = JSON.stringify(selectBilibili(candidate, ['media-1', 'media-2'], 'result'));
    expect(saved).not.toContain('private='); expect(saved).not.toContain('mcdn');
  });
  it('rejects foreign CID or different-representation mirrors even if another URL is approved', () => {
    for (const conflict of [ (url: string) => url.replaceAll('36531930223', '36508468243'), (url: string) => url.replace('-1-64.m4s', '-1-32.m4s') ]) {
      const f = fixture(), track = f.play.data.dash.video[0]!;
      Object.assign(track, { backupUrl: [conflict(track.baseUrl)] });
      const reason = f.candidate().media[1]!.reason;
      expect(reason).toMatch(/CID|representation path/);
    }
  });
  it('does not treat unsupported, credentialed or oversized mirror sets as authorized resources', () => {
    const f = fixture(), track = f.play.data.dash.video[0]!, approved = track.baseUrl, path = new URL(approved).pathname;
    track.baseUrl = `https://synthetic.mcdn.bilivideo.cn:8082/v1/resource${path}`;
    Object.assign(track, { backup_url: [approved.replace('https://', 'https://user:pass@'), approved.replace('.com/', '.com:8082/')] });
    expect(f.candidate().media[1]!.reason).toContain('No approved HTTPS');
    Object.assign(track, { backup_url: Array.from({ length: 17 }, () => approved) });
    expect(f.candidate().media[1]!.reason).toContain('16-mirror limit');
  });
  it('keeps only coarse bound duration when a nearby playinfo belongs to another CID',()=>{const f=fixture();f.play.data.timelength=26999;f.play.data.dash.video[0]!.baseUrl=f.play.data.dash.video[0]!.baseUrl.replaceAll('36531930223','36508468243');expect(f.candidate().payload).toMatchObject({part:{duration:27,durationPrecision:'coarse-seconds'}});});
  it('selects actual supported membership, not advertised-only quality or codec bitrate', () => { const f = fixture(); f.play.data.accept_quality.unshift(80); f.play.data.support_formats.unshift({ quality: 80 }); const c = f.candidate(); expect(c.media[1]!.tracks?.video.quality).toBe(64); });
  it('rejects conflicting quality ordering, contradictory dimensions and missing audio', () => { const f = fixture(); f.play.data.support_formats.reverse(); expect(f.candidate().media[1]!.reason).toContain('ordering'); f.play.data.support_formats.reverse(); f.play.data.dash.video[1]!.width = 1920; expect(f.candidate().media[1]!.reason).toContain('dimensions'); f.play.data.dash.audio = []; expect(f.candidate().media[1]!.reason).toContain('audio'); });
  it('accepts an explicitly silent DASH source without inventing an audio representation', () => {
    const f = fixture();
    Object.assign(f.play.data.dash, { audio: null, dolby: { type: 0, audio: null }, flac: null });
    const projected = projectBilibili(f.initial, f.play, url, true);
    expect(projected.play.dash.audioAbsent).toBe(true);
    const candidate = normalizeBilibili(projected, url);
    expect(candidate.media[1]).toMatchObject({ reason: null, tracks: { audio: null, video: { quality: 64 } } });
    expect(candidate.payload).toMatchObject({ representation: { audioAbsent: true, audioCodec: null, audioSource: null, audioBandwidth: null } });
    expect(candidate.media[1]!.quality).toContain('no audio');
  });
  it.each([
    { audio: undefined, dolby: { type: 0, audio: null }, flac: null },
    { audio: [], dolby: { type: 0, audio: null }, flac: null },
    { audio: {}, dolby: { type: 0, audio: null }, flac: null },
    { audio: null },
    { audio: null, dolby: { type: 1, audio: [{ id: 30250 }] }, flac: null },
    { audio: null, dolby: { type: 0, audio: null }, flac: { audio: { id: 30251 } } },
  ])('does not infer silence from missing, malformed or alternative audio: %j', fields => {
    const f = fixture(); Object.assign(f.play.data.dash, fields);
    expect(projectBilibili(f.initial, f.play, url, true).play.dash.audioAbsent).toBe(false);
    const candidate = f.candidate(); expect(candidate.media[1]!.tracks).toBeUndefined();
    expect(candidate.media[1]!.reason).toContain('audio'); expect(candidate.payload).not.toBeNull();
  });
  it('does not claim unqualified AV1 as supported AVC', () => { const f = fixture(); for (const v of f.play.data.dash.video) v.codecs = 'av01.0.08M.08'; expect(f.candidate().media[1]!.reason).toContain('AV1'); });
  it('allows only grounded tracking keys without altering current-part identity', () => { expect(partUrl(url + '&spm_id_from=synthetic&trackid=1&share_source=copy_web&vd_source=x').id).toBe(partUrl(url).id); for (const value of [url + '&p=1', url.replace('p=2', 'p=0'), url.replace('/video/', '/bangumi/'), url + '&unknown=1']) expect(() => partUrl(value)).toThrow(); });
  it('upgrades only an approved cover and rejects offsite/credential/port resource URLs', () => { expect(bilibiliResource('http://i0.hdslb.com/bfs/archive/a.jpg?x=1', 'cover')).toBe('https://i0.hdslb.com/bfs/archive/a.jpg?x=1'); for (const value of ['https://evil.com/a.jpg', 'https://u:p@i0.hdslb.com/bfs/archive/a.jpg', 'https://i0.hdslb.com:444/bfs/archive/a.jpg']) expect(() => bilibiliResource(value, 'cover')).toThrow(); });
});
