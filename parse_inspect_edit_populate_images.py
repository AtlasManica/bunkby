with open("src/App.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Let's inspect where Edit details button parses room.images:
idx = text.find('setIsEditing(room.id);')
idx_start = text.rfind('onClick={() => {', 0, idx)
print("=== Edit details button in App.tsx ===")
print(text[idx_start:idx+300])
