import * as path from 'path';
import * as fs from 'fs';
import { createCanvas, loadImage, registerFont } from 'canvas';

registerFont(path.join(__dirname, '../assets/', 'AlegreyaSans-Regular.ttf'), { family: 'Alegreya Sans' });

  // TODO: If deploying this need to
  // - Bundle the font
  // - Verify this actually works! since it requires cairo installed locally
export const createCover = async (message: string, outputFile: string): Promise<string> => {
  // Creating a cover programmatically
  const canvas = createCanvas(938, 1500);
  const ctx = canvas.getContext('2d');

  var image = await loadImage(path.join(__dirname, '../assets/', 'PocketToolsCover.jpg'));
  ctx.drawImage(image, 0, 0, 938, 1500);

  // Write Date
  ctx.font = '76px Alegreya Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(message, 45, 380); 
  
  // Put line divider
  ctx.strokeStyle = 'rgba(1,1,1,0.5)';
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.lineTo(38, 280);
  ctx.lineTo(520, 280);
  ctx.stroke();

  let stream = canvas.createJPEGStream({
    quality: 50, // JPEG quality (0-100) default: 75
    progressive: true // true for progressive compression, default: false
  });

  return new Promise<string>((resolve, reject) => {
    let jpg = fs.createWriteStream(outputFile);
    stream.pipe(jpg);
    jpg.on('finish', x => resolve(outputFile));
    jpg.on('error', x => reject('Error saving cover'));
  })
}