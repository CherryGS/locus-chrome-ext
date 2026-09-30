/** Synthetic async native bootstrap and player, separate from capture execution. */
export function bilibiliNativeFixture(part, watchlaterBvid) {
  return `<div id="bilibili-player" aria-label="Native player"><div class="bpx-player-container"></div></div>
    <button id="native-p1">Play native P1</button><button id="native-p2">Play native P2</button>
    <script>
    addEventListener('load', () => setTimeout(() => {
      // A server-rendered toolbar is still owned by the page during bootstrap.
      document.documentElement.dataset.prematureCapture = String(
        document.querySelector('.video-toolbar-left-main').children.length !== 4 ||
        !!document.querySelector('[data-locus-bilibili-queue]')
      );
      document.querySelector('#app').removeAttribute('data-server-rendered');
      const player = document.querySelector('#bilibili-player .bpx-player-container');
      const video = document.createElement('video'); video.muted = true; video.loop = true;
      video.controls = true; video.width = 160; video.height = 90; player.append(video);
      const select = (part, navigate) => {
        if (navigate) {
          history.pushState({}, '', ${JSON.stringify(watchlaterBvid ? `?bvid=${watchlaterBvid}&oid=116182891959963&` : '?')} + 'p=' + part + '&vd_source=fixture');
          document.querySelector(${JSON.stringify(watchlaterBvid ? 'h1 a' : 'h1')}).textContent = 'Synthetic Bilibili P' + part;
        }
        video.dataset.part = String(part); video.src = '/fixture-native.mp4?p=' + part;
        void video.play().catch(() => {});
      };
      document.querySelector('#native-p1').onclick = () => select(1, true);
      document.querySelector('#native-p2').onclick = () => select(2, true);
      select(${part}, false);
    }, 900), { once: true });
    </script>`;
}
