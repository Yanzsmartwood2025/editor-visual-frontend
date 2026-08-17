import re

with open('src/pages/index.tsx', 'r') as f:
    content = f.read()

# Remove .editor-shell from media query and put it before
content = content.replace(".editor-shell { height: 100vh; overflow: hidden; }", "")
content = content.replace("    @media (min-width: 768px) {", "    .editor-shell { height: 100dvh; overflow: hidden; }\n    @media (min-width: 768px) {")

# We want to extract `.editor-grid.video-expanded ...` rules out of the media query.
# Let's extract the fixed rules and put them globally.
# Note: we need `.editor-grid.video-expanded` to remain in desktop for grid layout, but we also want the fixed elements to be global.
# Let's just create global rules that override when .video-expanded is active.

global_video_expanded = """
    .editor-grid.video-expanded .editor-preview-panel {
      position: fixed;
      inset: 0;
      z-index: 9000;
      border-radius: 0;
      border: 0;
      background: #000 !important;
    }
    .editor-grid.video-expanded .editor-preview-canvas {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      border: 0 !important;
      border-radius: 0 !important;
    }
    .editor-grid.video-expanded .editor-playback-bar {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      width: min(680px, calc(100vw - 32px));
      z-index: 9001;
    }
    .editor-grid.video-expanded .editor-media-gallery,
    .editor-grid.video-expanded .panel-container,
    .editor-grid.video-expanded .nayla-chat-panel {
      display: none !important;
    }
    .responsive-panel-height {
      min-height: auto;
    }
    @media (min-width: 768px) {
      .responsive-panel-height {
        min-height: 35vh;
      }
    }
"""

content = content.replace("    @media (min-width: 768px) {", global_video_expanded + "\n    @media (min-width: 768px) {")

# Remove these rules from inside the media query
content = re.sub(r"      \.editor-grid\.video-expanded \.editor-preview-panel \{.*?\}\n", "", content, flags=re.DOTALL)
content = re.sub(r"      \.editor-grid\.video-expanded \.editor-preview-canvas \{.*?\}\n", "", content, flags=re.DOTALL)
content = re.sub(r"      \.editor-grid\.video-expanded \.editor-playback-bar \{.*?\}\n", "", content, flags=re.DOTALL)
content = re.sub(r"      \.editor-grid\.video-expanded \.editor-media-gallery \{\s+display: none !important;\s+\}\n", "", content)
content = re.sub(r"      \.editor-grid\.video-expanded \.panel-container \{\s+display: none !important;\s+\}\n", "", content)
content = re.sub(r"      \.editor-grid\.video-expanded \.nayla-chat-panel \{\s+display: none !important;\s+\}\n", "", content)

# Now fix inline styles for panel-container
content = content.replace("style={{ position: 'relative', bottom: 'auto', flex: 1, minHeight: '35vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}", "className=\"panel-container responsive-panel-height\" style={{ position: 'relative', bottom: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}")
content = content.replace("style={{ position: 'relative', bottom: 'auto', flex: 1, minHeight: '35vh', overflowY: 'auto', padding: '16px' }}", "className=\"panel-container responsive-panel-height\" style={{ position: 'relative', bottom: 'auto', flex: 1, overflowY: 'auto', padding: '16px' }}")
content = content.replace("style={{ position: 'relative', bottom: 'auto', flex: 1, minHeight: '35vh', overflowY: 'auto' }}", "className=\"panel-container responsive-panel-height\" style={{ position: 'relative', bottom: 'auto', flex: 1, overflowY: 'auto' }}")

# Ensure classNames combine properly
content = content.replace("className=\"panel-container\" className=\"panel-container responsive-panel-height\"", "className=\"panel-container responsive-panel-height\"")

with open('src/pages/index.tsx', 'w') as f:
    f.write(content)
