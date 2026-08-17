with open('src/pages/index.tsx', 'r') as f:
    content = f.read()

# Replace min-h-screen with h-[100dvh] so it's strictly that height, avoiding extra scrolling.
content = content.replace("editor-shell min-h-screen", "editor-shell h-[100dvh]")

with open('src/pages/index.tsx', 'w') as f:
    f.write(content)
