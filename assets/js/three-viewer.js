import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Make available globally for inline scripts
window.THREE = THREE;
window.OrbitControls = OrbitControls;
window.GLTFLoader = GLTFLoader;

// Lightweight Three.js 3D Model Viewer for Portfolio Cards
// Usage: new ThreeViewer(containerElement, modelPath, options)

class ThreeViewer {
  constructor(container, modelPath, options = {}) {
    this.container = container;
    this.modelPath = modelPath;
    this.options = {
      autoRotate: true,
      scale: 1,
      ...options
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;

    console.log("ThreeViewer created for:", modelPath);
    this.init();
    this.loadModel();
  }

  init() {
    console.log("ThreeViewer.init() called");
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null;

    // Camera
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    console.log("Container size:", width, "x", height);
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 1, 2.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.toneMappingExposure = 1.5;
    this.container.appendChild(this.renderer.domElement);
    console.log("Renderer created and added to DOM");

    // Lighting - aggressive setup for dark baked textures
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(5, 3, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
    fillLight.position.set(-5, 2, -5);
    this.scene.add(fillLight);
    
    const topLight = new THREE.DirectionalLight(0xffffff, 1.0);
    topLight.position.set(0, 5, 0);
    this.scene.add(topLight);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = this.options.autoRotate;
    this.controls.autoRotateSpeed = 4;
    console.log("Controls initialized");

    // Handle window resize
    window.addEventListener("resize", () => this.onWindowResize());

    // Start animation loop
    this.animate();
  }

  loadModel() {
    const loader = new GLTFLoader();
    console.log("Loading model from:", this.modelPath);

    loader.load(
      this.modelPath,
      (gltf) => {
        console.log("Model loaded successfully:", gltf);
        this.model = gltf.scene;
        this.model.scale.set(this.options.scale, this.options.scale, this.options.scale);
        this.scene.add(this.model);

        // Center the model
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        this.model.position.sub(center);

        // Remove loading text if exists
        const loadingText = this.container.querySelector("[data-loading]");
        if (loadingText) loadingText.remove();
      },
      undefined,
      (error) => {
        console.error("Error loading model:", error);
        const loadingText = this.container.querySelector("[data-loading]");
        if (loadingText) loadingText.textContent = "Failed to load model";
      }
    );
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  toggleAutoRotate() {
    this.controls.autoRotate = !this.controls.autoRotate;
  }

  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
// Make ThreeViewer globally available
window.ThreeViewer = ThreeViewer;