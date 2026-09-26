// Prépare un logo choisi dans Réglages avant son envoi au serveur (voir
// server/src/routes/settings.js, POST /settings/logo) : n'importe quelle image lisible par le
// navigateur (photo de téléphone de plusieurs Mo, SVG...) est ramenée à LOGO_MAX_SIDE pixels
// sur son plus grand côté et convertie en PNG — la transparence des logos est conservée.
const LOGO_MAX_SIDE = 512;
const MAX_DATA_URL_LENGTH = 700_000;

export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Ce fichier n’est pas une image.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Impossible de lire cette image.'));
      image.src = objectUrl;
    });
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || LOGO_MAX_SIDE) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || LOGO_MAX_SIDE) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Impossible de préparer l’image.');
    ctx.drawImage(img, 0, 0, width, height);
    // Nginx refuse par défaut les requêtes de plus de 1 Mo : une photo détaillée peut dépasser
    // cette taille en PNG, on bascule alors sur WebP (garde la transparence), puis JPEG.
    const png = canvas.toDataURL('image/png');
    if (png.length <= MAX_DATA_URL_LENGTH) return png;
    const webp = canvas.toDataURL('image/webp', 0.9);
    if (webp.startsWith('data:image/webp') && webp.length <= MAX_DATA_URL_LENGTH) return webp;
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
