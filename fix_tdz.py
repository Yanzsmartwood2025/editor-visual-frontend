with open('src/pages/index.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove pistaVideo, pistaAudio, hayClips from bottom if present
content = content.replace("  const pistaVideo = lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto');\n", "")
content = content.replace("  const pistaAudio = lineaDeTiempo.filter(t => t.tipo === 'audio');\n", "")
content = content.replace("  const hayClips = pistaVideo.length > 0;\n", "")

# Place them right before resetPlaybackControlsTimer or before return
target = "  const resetPlaybackControlsTimer = () => {"
replacement = """  const pistaVideo = lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto');
  const pistaAudio = lineaDeTiempo.filter(t => t.tipo === 'audio');
  const hayClips = pistaVideo.length > 0;

  const resetPlaybackControlsTimer = () => {"""

if target in content:
    content = content.replace(target, replacement, 1)

with open('src/pages/index.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("TDZ variables moved before return statement")
