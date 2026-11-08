import masiaFreixaLight from '../icons/landmarks/masia_freixa_poi.png';
import masiaFreixaDark from '../icons/landmarks/masia_freixa_poi_dark.png';
import egaraLight from '../icons/landmarks/egara_poi_light.png';
import egaraDark from '../icons/landmarks/egara_poi_dark.png';
import stadiumDark from '../icons/landmarks/stadium_icon_dark.png';
import stadiumLight from '../icons/landmarks/stadium_icon_light.png';
import towerDark from '../icons/landmarks/tower_poi_dark.png';
import towerLight from '../icons/landmarks/tower_poi_light.png';
import torreLight from '../icons/landmarks/torre_de_palau_light_icon.png';
import torreDark from '../icons/landmarks/torre_de_palau_dark_icon.png';

export const LANDMARKS = [
  { id: '1', name: 'La Masia Freixa', description: 'un edificio modernista',
    lon: 2.0043237, lat: 41.5625222, scale: 1.3,
    icons: { 'light-gray': masiaFreixaLight, 'dark-gray': masiaFreixaDark } },
  { id: '2', name: 'La Seu d’Ègara', description: 'monumento histórico',
    lon: 2.018426, lat: 41.566897, scale: 1.3,
    icons: { 'light-gray': egaraLight, 'dark-gray': egaraDark } },
  { id: '3', name: 'Estadi Olímpic de Terrassa', description: 'un edificio esport',
    lon: 2.010681, lat: 41.575888, scale: 1.3,
    icons: { 'light-gray': stadiumDark, 'dark-gray': stadiumLight } },
  { id: '4', name: 'Chimney of Bòbila Almirall', description: 'monumento histórico',
    lon: 1.999587, lat: 41.557715, scale: 1.5,
    icons: { 'light-gray': towerDark, 'dark-gray': towerLight } },
  { id: '5', name: 'Torre del Palau', description: 'monumento histórico',
    lon: 2.010842, lat: 41.562388, scale: 1.5,
    icons: { 'light-gray': torreDark, 'dark-gray': torreLight } },
];
