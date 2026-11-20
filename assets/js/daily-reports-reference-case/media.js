(() => {
  'use strict';
  window.DailyReportReferenceMedia = {
    mount(form) {
      const queues = { images: [], videos: [] };
      const escape = window.DailyReportsUI.escape;
      function render(kind) {
        const host = form.querySelector(`[data-reference-queue="${kind}"]`);
        if (!host) return;
        host.innerHTML = queues[kind].map((file, index) => `<li>${escape(file.name)}
          <button class="ghost" type="button" data-remove="${index}">Bỏ tệp</button></li>`).join('');
        host.querySelectorAll('[data-remove]').forEach(button => {
          button.onclick = () => {
            queues[kind].splice(Number(button.dataset.remove), 1);
            render(kind);
          };
        });
      }
      for (const input of form.querySelectorAll('[data-reference-files]')) {
        input.onchange = () => {
          const kind = input.dataset.referenceFiles;
          const incoming = [...input.files];
          const combined = [...queues.images, ...queues.videos, ...incoming];
          const extensions = kind === 'images' ? /\.(png|jpe?g)$/i : /\.(mp4|mov|webm)$/i;
          const status = form.querySelector('[data-reference-status]');
          if (incoming.some(file => !extensions.test(file.name) || file.size > 10 * 1024 * 1024)
            || combined.length > 10 || combined.reduce((size, file) => size + file.size, 0) > 20 * 1024 * 1024) {
            status.textContent = 'Tệp sai loại hoặc vượt giới hạn 10 MB/tệp, 10 tệp và tổng 20 MB.';
          } else {
            queues[kind].push(...incoming);
            status.textContent = '';
            render(kind);
          }
          input.value = '';
        };
      }
      return {
        reset() {
          queues.images = [];
          queues.videos = [];
          render('images');
          render('videos');
        },
        async read() {
          return Promise.all([...queues.images, ...queues.videos].map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(`Không đọc được ${file.name}.`));
            reader.onload = () => resolve({ name: file.name, content: String(reader.result).split(',')[1] });
            reader.readAsDataURL(file);
          })));
        }
      };
    }
  };
})();
