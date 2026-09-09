with open('src/pages/index.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract globalStyles string
start_idx = content.find("  const globalStyles = `")
end_idx = content.find("  `;\nif (!session) {")

if start_idx != -1 and end_idx != -1:
    gs_block = content[start_idx:end_idx + 4] # includes `;\n
    content = content[:start_idx] + content[end_idx + 4:]

    # Place right inside NaylaCore at top
    core_marker = "export default function NaylaCore() {"
    content = content.replace(core_marker, core_marker + "\n" + gs_block, 1)

    with open('src/pages/index.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("globalStyles successfully moved to top of NaylaCore")
else:
    print("Could not match globalStyles block", start_idx, end_idx)
