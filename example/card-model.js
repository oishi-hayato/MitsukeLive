/**
 * 3D Card Model Creator
 * Creates various types of 3D card models for AR/3D examples
 */

// Card configuration constants
const DEFAULT_CARD_CONFIG = {
  WIDTH_RATIO: 0.67, // Width ratio relative to height
  HEIGHT: 1.0, // Height (base unit)
  DEPTH: 0.02, // Thickness (extrusion depth)
  BEVEL: 0.02, // Corner roundness
  METALNESS: 0.5, // Metallic appearance
  ROUGHNESS: 1.0, // Surface roughness
  OPACITY: 0.6, // Transparency
  GLOSS: 0.1, // Glossiness level
  COLOR: 0x000000, // Color (black)
};

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
  width = DEFAULT_CARD_CONFIG.HEIGHT * DEFAULT_CARD_CONFIG.WIDTH_RATIO,
  height = DEFAULT_CARD_CONFIG.HEIGHT,
  thickness = DEFAULT_CARD_CONFIG.DEPTH,
  cornerRadius = DEFAULT_CARD_CONFIG.BEVEL,
  opacity = DEFAULT_CARD_CONFIG.OPACITY,
  gloss = DEFAULT_CARD_CONFIG.GLOSS
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

  // Create optimized glossy material using config values
  const material = new THREE.MeshPhysicalMaterial({
    color: DEFAULT_CARD_CONFIG.COLOR,
    metalness: DEFAULT_CARD_CONFIG.METALNESS,
    roughness: Math.max(0.05, DEFAULT_CARD_CONFIG.ROUGHNESS - gloss * 0.1),
    reflectivity: Math.max(0.8, 0.8 + gloss * 0.2),
    clearcoat: Math.max(0.6, 0.6 + gloss * 0.4),
    clearcoatRoughness: Math.max(0.05, 0.1 - gloss * 0.05),
    envMapIntensity: Math.max(1.0, 1.0 + gloss * 0.5),
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
export function createDebugCube(size = DEFAULT_CARD_CONFIG.HEIGHT, color = 0x00ff00) {
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
