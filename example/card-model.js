/**
 * 3D Card Model Creator
 * Creates various types of 3D card models for AR/3D examples
 */

/**
 * Create a simple card model with thickness
 * @param {number} width - Card width in meters
 * @param {number} height - Card height in meters
 * @param {number} color - Card color (hex)
 * @param {number} thickness - Card thickness in meters (default: 0.0005 = 0.5mm)
 * @param {number} opacity - Card opacity (0.0 to 1.0, default: 1.0)
 * @param {number} gloss - Gloss level (0.0 to 1.0, default: 0.6)
 * @returns {THREE.Mesh} Card mesh
 */
export function createSimpleCard(
  width = 0.005,
  height = 0.005,
  color = 0xff0000,
  thickness = 0.0005,
  opacity = 1.0,
  gloss = 0.6
) {
  const geometry = new THREE.BoxGeometry(width, height, thickness);
  const material = new THREE.MeshPhysicalMaterial({
    color: color,
    opacity: opacity,
    transparent: opacity < 1.0,
    metalness: 0.4, // Higher metalness for more shine
    roughness: 0.15 - gloss * 0.1, // Much smoother surface (0.15 base), gloss 0 = 0.15 roughness
    reflectivity: 0.95 + gloss * 0.05, // Very high reflectivity (0.95 base)
    clearcoat: 0.8 + gloss * 0.2, // Strong clearcoat (0.8 base)
    clearcoatRoughness: 0.1 - gloss * 0.08, // Very smooth clearcoat (0.1 base)
    envMapIntensity: 1.5 + gloss * 1.0, // Strong environment map reflection
    ior: 1.5, // Index of refraction for more realistic reflections
    sheen: 0.3, // Add sheen for fabric-like highlights
    sheenRoughness: 0.5,
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Create a glossy black card with rounded corners
 * @param {number} width - Card width in meters (default: 30mm)
 * @param {number} height - Card height in meters (default: 35mm)
 * @param {number} thickness - Card thickness in meters (default: 0.4mm)
 * @param {number} cornerRadius - Corner radius in meters (default: 2mm)
 * @param {number} opacity - Card opacity (0.0 to 1.0, default: 1.0)
 * @param {number} gloss - Gloss level (0.0 to 1.0, default: 0.6)
 * @returns {THREE.Mesh} Glossy card mesh
 */
export function createGlossyCard(
  width = 0.03,
  height = 0.035,
  thickness = 0.0004,
  cornerRadius = 0.002,
  opacity = 1.0,
  gloss = 0.6
) {
  // Create rounded rectangle shape
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const w = width;
  const h = height;
  const radius = cornerRadius;

  shape.moveTo(x + radius, y);
  shape.lineTo(x + w - radius, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + radius);
  shape.lineTo(x + w, y + h - radius);
  shape.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  shape.lineTo(x + radius, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  // Extrude the shape to create 3D card
  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.00005,
    bevelSize: 0.00005,
    bevelSegments: 2,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Create optimized glossy black material (reduced complexity for better performance)
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x000000, // Black color
    metalness: 0.2, // Moderate metalness
    roughness: Math.max(0.05, 0.15 - gloss * 0.1), // Moderate smoothness
    reflectivity: Math.max(0.8, 0.8 + gloss * 0.2), // Good reflectivity
    clearcoat: Math.max(0.6, 0.6 + gloss * 0.4), // Moderate clearcoat
    clearcoatRoughness: Math.max(0.05, 0.1 - gloss * 0.05), // Moderate clearcoat smoothness
    envMapIntensity: Math.max(1.0, 1.0 + gloss * 0.5), // Reduced environment reflections
    opacity: opacity,
    transparent: opacity < 1.0,
    // Remove expensive transmission and IOR for better performance
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Create a wireframe cube for debugging
 * @param {number} size - Cube size in meters
 * @param {number} color - Wireframe color (hex)
 * @returns {THREE.Mesh} Wireframe cube mesh
 */
export function createDebugCube(size = 0.01, color = 0x00ff00) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshBasicMaterial({
    color: color,
    wireframe: true,
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Set up scene lighting for glossy materials
 * @param {THREE.Scene} scene - Three.js scene
 */
export function setupSceneLighting(scene) {
  // Optimized lighting setup with fewer lights for better performance

  // Ambient light for basic illumination
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  // Single main directional light
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
  mainLight.position.set(0.5, 1, 2);
  scene.add(mainLight);

  // One point light for highlights
  const highlight = new THREE.PointLight(0xffffff, 0.6);
  highlight.position.set(0, 0.02, -0.03);
  scene.add(highlight);
}
