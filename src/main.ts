import './ui/style.css';
import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('#app root element missing');

new Game(app).start().catch((err) => {
  console.error('Failed to start Monster Truck Farm', err);
  app.innerHTML = '<div class="layer overlay loading"><div class="panel"><h1>😢 Oh no!</h1><p>This browser could not start the 3D farm. Try a recent Chrome, Edge, Firefox or Safari.</p></div></div>';
});
