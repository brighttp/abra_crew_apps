export async function seed(k) {
  for (const name of [
    'TouchDesigner',
    'ComfyUI',
    'SolidJS',
    'Photobooth',
    'Registration',
    'Hardware',
    'Troubleshooting',
    'Camera Operator',
    'Networking',
    'AI Generation',
  ])
    await k('skills')
      .insert({ name, slug: name.toLowerCase().replace(/\s+/g, '-') })
      .onConflict('name')
      .ignore();
}
