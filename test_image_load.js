const dom = `
<div style="display: flex; height: 60px; overflow-x: auto; padding: 0 50%; gap: 0; align-items: center;">
  <div class="clip-block selected">
    <img src="blob:..." style="width: 100%; height: 100%; object-fit: cover;" />
    <span>V1</span>
  </div>
</div>
`
console.log("No obvious issue in structure of filmstrip. Checking the image render logic...");
