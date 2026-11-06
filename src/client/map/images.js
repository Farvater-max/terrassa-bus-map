export function loadLandmarkImages(landmarks, onLoad) {
  const images = new Map();
  const key = (landmark, style) => `${landmark.id}:${style}`;

  for (const landmark of landmarks) {
    for (const [style, src] of Object.entries(landmark.icons)) {
      const image = new Image();
      image.onload = () => {
        images.set(key(landmark, style), image);
        onLoad();
      };
      image.src = src;
    }
  }

  return {
    get: (landmark, style) => images.get(key(landmark, style)),
  };
}
