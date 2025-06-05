/* global AFRAME, THREE */

// =====================================
// AR/VR Scale Adjuster (Copied from your components.txt)
// Ensure this is available if you use it.
// =====================================
AFRAME.registerComponent('ar-scale-adjuster', {
    schema: {
        arScale: { type: 'number', default: 0.5 },
        vrScale: { type: 'number', default: 1.0 },
        arYOffset: { type: 'number', default: 1.0 },
        vrYOffset: { type: 'number', default: 0.0 },
        defaultPosVR: { type: 'vec3', default: { x: 0, y: 0, z: -5 } },
        defaultPosAR: { type: 'vec3', default: { x: 0, y: 0, z: -3 } }
    },
    init: function() {
        this.sceneEl = this.el.sceneEl;
        this.currentScale = this.data.vrScale; // Initialize with VR scale
        this.checkDelayTimer = null;

        this.defaultPositionVR = AFRAME.utils.clone(this.data.defaultPosVR);
        this.defaultPositionAR = AFRAME.utils.clone(this.data.defaultPosAR);
        
        this.onEnterXR = this.onEnterXR.bind(this);
        this.onExitXR = this.onExitXR.bind(this);
        this.checkXRMode = this.checkXRMode.bind(this);

        this.sceneEl.addEventListener('enter-vr', this.onEnterXR); // A-Frame 1.6.0 uses 'enter-vr'
        this.sceneEl.addEventListener('exit-vr', this.onExitXR);   // and 'exit-vr' for generic XR sessions

        this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
        this.checkURLParameters();
    },
    onEnterXR: function() {
        this.checkDelayTimer = setTimeout(this.checkXRMode, 500);
    },
    checkXRMode: function() {
        const renderer = this.sceneEl.renderer;
        const xrManager = renderer.xr;

        if (xrManager && xrManager.isPresenting) {
            const session = xrManager.getSession();
            if (session) {
                const isAR = this.detectARMode(session);
                if (isAR) {
                    document.body.classList.add('ar-mode');
                    document.body.classList.remove('vr-mode');
                    this.applyTransform(this.data.arScale, this.defaultPositionAR.y + this.data.arYOffset, true);
                } else {
                    document.body.classList.add('vr-mode');
                    document.body.classList.remove('ar-mode');
                    this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
                }
            } else { // Fallback if session details are not immediately available
                this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
            }
        } else { // Not presenting
            this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
        }
    },
    detectARMode: function(session) {
        // A-Frame 1.5.0+ might use session.environmentBlendMode
        if (session.environmentBlendMode === 'additive' || session.environmentBlendMode === 'alpha-blend') {
            return true;
        }
        // Older or other WebXR implementations might need feature detection
        if (session.enabledFeatures) {
            const arFeatures = ['hit-test', 'plane-detection', 'anchors', 'camera-access', 'dom-overlay'];
            if (arFeatures.some(feature => session.enabledFeatures.includes(feature))) {
                 // Check if it's not 'immersive-vr' which might also have some of these features
                if (session.mode !== 'immersive-vr') return true;
            }
        }
        // Quest Passthrough specific hack (if applicable and you know it's Quest)
        // This is less reliable general purpose.
        // For Quest, 'local-floor' or 'bounded-floor' reference spaces are common in VR,
        // while AR might use 'viewer' or 'unbounded'.
        // The environmentBlendMode is the most reliable.
        return false;
    },
    isMetaQuestPassthrough: function() {
        // This function is highly specific and might not be reliable.
        // Prefer detectARMode using session properties.
        const isQuest = navigator.userAgent.includes('Quest') || navigator.userAgent.includes('OculusBrowser');
        if (!isQuest) return false;
        // Passthrough might be indicated by specific session features or modes.
        // This example is a placeholder for more robust detection if needed.
        return window.location.search.includes('passthrough=true');
    },
    checkURLParameters: function() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('ar') === 'true' || urlParams.get('passthrough') === 'true') {
            this.applyTransform(this.data.arScale, this.defaultPositionAR.y + this.data.arYOffset, true);
            document.body.classList.add('ar-mode', 'url-forced-ar');
        }
    },
    onExitXR: function() {
        if (this.checkDelayTimer) {
            clearTimeout(this.checkDelayTimer);
            this.checkDelayTimer = null;
        }
        this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
        document.body.classList.remove('ar-mode', 'vr-mode', 'url-forced-ar');
        // Ensure scene is visible and at normal scale
        if (this.sceneEl && this.sceneEl.object3D) {
            this.sceneEl.object3D.visible = true;
        }
    },
    applyTransform: function(scale, yPos, isAR) {
        const basePosition = isAR ? this.defaultPositionAR : this.defaultPositionVR;
        this.el.setAttribute('scale', `${scale} ${scale} ${scale}`);
        this.el.setAttribute('position', { x: basePosition.x, y: yPos, z: basePosition.z });

        // Log transform application for debugging
        // console.log(`Applied transform: Mode=${isAR ? 'AR' : 'VR'}, Scale=${scale}, Position=`, this.el.getAttribute('position'));
    },
    remove: function() {
        if (this.checkDelayTimer) clearTimeout(this.checkDelayTimer);
        this.sceneEl.removeEventListener('enter-vr', this.onEnterXR);
        this.sceneEl.removeEventListener('exit-vr', this.onExitXR);
        document.body.classList.remove('ar-mode', 'vr-mode', 'url-forced-ar');
    }
});


// =====================================
// DEM Terrain Component
// =====================================
AFRAME.registerComponent('dem-terrain', {
    schema: {
        demImagePath: { type: 'string', default: 'grayscale_raster.png' },
        planeSize: { type: 'number', default: 100 },
        heightScale: { type: 'number', default: 10 },
        segments: { type: 'number', default: 255 },
        textureRepeat: { type: 'vec2', default: {x: 1, y: 1} }, // For texture tiling
        color: {type: 'color', default: '#787878'}, // Default terrain color if no texture
        useImageAsTexture: {type: 'boolean', default: true} // Use DEM image also for color
    },

    init: function () {
        this.loaderDiv = document.getElementById('loader');
        if (this.loaderDiv) this.loaderDiv.style.display = 'block';

        this.loadDEM();
    },

    loadDEM: function () {
        const { demImagePath } = this.data;
        const imgLoader = new THREE.ImageLoader();

        // Handle CORS if the image is on a different domain
        // imgLoader.setCrossOrigin('anonymous'); // Uncomment if needed

        imgLoader.load(demImagePath,
            (image) => {
                const imgWidth = image.width;
                const imgHeight = image.height;

                const canvas = document.createElement('canvas');
                canvas.width = imgWidth;
                canvas.height = imgHeight;
                const context = canvas.getContext('2d');
                if (!context) {
                    console.error("Failed to get 2D context from canvas!");
                    if (this.loaderDiv) this.loaderDiv.textContent = 'Error: Canvas 2D context failed.';
                    return;
                }
                context.drawImage(image, 0, 0);

                let imageData;
                try {
                    imageData = context.getImageData(0, 0, imgWidth, imgHeight);
                } catch (e) {
                    console.error("Error getting imageData (potential CORS issue):", e);
                    if (this.loaderDiv) this.loaderDiv.textContent = 'Error getting image data. Check console for CORS/security issues if loading from file:// or cross-origin.';
                    // For file://, try running a local web server.
                    return;
                }
                const data = imageData.data;
                this.createTerrainMesh(data, imgWidth, imgHeight);
                if (this.loaderDiv) this.loaderDiv.style.display = 'none';
            },
            undefined, // onProgress callback (optional)
            (error) => {
                console.error('An error occurred loading the DEM image:', error);
                if (this.loaderDiv) {
                    if (error.target && error.target.status === 404) {
                         this.loaderDiv.textContent = `Error 404: Image not found at ${demImagePath}. Check path.`;
                    } else if (error.message && error.message.includes('Access-Control-Allow-Origin')) {
                        this.loaderDiv.textContent = `CORS Error: Cannot load ${demImagePath}. Serve files from a web server or check CORS headers.`;
                    }
                     else {
                        this.loaderDiv.textContent = 'Error loading DEM. Check console.';
                    }
                }
            }
        );
    },

    createTerrainMesh: function (demData, demWidth, demHeight) {
        const { planeSize, heightScale, segments, textureRepeat, color, useImageAsTexture, demImagePath } = this.data;

        const geometry = new THREE.PlaneGeometry(planeSize, planeSize, segments, segments);
        const positions = geometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i); // Plane X: -planeSize/2 to +planeSize/2
            const y = positions.getY(i); // Plane Y: -planeSize/2 to +planeSize/2 (before rotation)

            let u = (x / planeSize) + 0.5;
            let v = 1.0 - ((y / planeSize) + 0.5); // Invert V for image coords

            u = Math.max(0, Math.min(1, u));
            v = Math.max(0, Math.min(1, v));

            const demX = Math.floor(u * (demWidth - 1));
            const demY = Math.floor(v * (demHeight - 1));

            const pixelIndex = (demY * demWidth + demX) * 4;
            const grayscaleValue = demData[pixelIndex] / 255; // Assuming R is intensity

            positions.setZ(i, grayscaleValue * heightScale);
        }
        geometry.computeVertexNormals();

        let material;
        if (useImageAsTexture) {
            const textureLoader = new THREE.TextureLoader();
            // textureLoader.setCrossOrigin('anonymous'); // If image for texture is also cross-origin
            const demTexture = textureLoader.load(demImagePath, (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(textureRepeat.x, textureRepeat.y);
                tex.needsUpdate = true;
                // A-Frame's renderer handles color space if 'colorManagement: true' is on <a-scene>
                // tex.colorSpace = THREE.SRGBColorSpace; (No longer manually set this way in recent THREE with A-Frame)
            });
            material = new THREE.MeshStandardMaterial({
                map: demTexture,
                roughness: 0.9,
                metalness: 0.1,
                side: THREE.FrontSide // Typically FrontSide is enough unless you see through it
            });
        } else {
            material = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.8,
                metalness: 0.2,
                side: THREE.FrontSide
            });
        }

        const terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2; // Rotate plane to be horizontal (XZ plane)

        // For A-Frame, you set shadows on the entity, not directly on the mesh material in the same way
        // The entity will pick up shadow system settings from A-Frame if configured.
        // this.el.setAttribute('shadow', 'cast: true; receive: true'); // If you want shadows

        this.el.setObject3D('dem-mesh', terrainMesh);
        console.log("DEM Terrain mesh added to A-Frame entity.");
    },

    remove: function () {
        // Clean up the mesh if the component is removed
        this.el.removeObject3D('dem-mesh');
        if (this.loaderDiv) this.loaderDiv.style.display = 'none';
    }
});

// Optional: Stars component (if you want to use it from index.html)
AFRAME.registerComponent('stars', {
    schema: {
        count: { type: 'number', default: 1000 },
        radius: { type: 'number', default: 100 },
        color: { type: 'color', default: '#FFFFFF' }
    },
    init: function() {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        for (let i = 0; i < this.data.count; i++) {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;
            const x = this.data.radius * Math.sin(theta) * Math.cos(phi);
            const y = this.data.radius * Math.sin(theta) * Math.sin(phi);
            const z = this.data.radius * Math.cos(theta);
            vertices.push(x, y, z);
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.PointsMaterial({
            color: this.data.color,
            size: 0.5,
            sizeAttenuation: true
        });
        const stars = new THREE.Points(geometry, material);
        this.el.setObject3D('stars-points', stars); // Use a unique key
    },
    remove: function() {
        this.el.removeObject3D('stars-points');
    }
});