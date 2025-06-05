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


/* global AFRAME, THREE */

// ... (ar-scale-adjuster and vr-dem-zoom components remain the same) ...
// ... (Keep them here if they are in your file) ...


// =====================================
// DEM Terrain Component (MODIFIED)
// =====================================
AFRAME.registerComponent('dem-terrain', {
    schema: {
        demImagePath: { type: 'string', default: 'grayscale_raster.png' },
        planeSize: { type: 'number', default: 100 },
        heightScale: { type: 'number', default: 10 },
        segments: { type: 'number', default: 255 },
        textureRepeat: { type: 'vec2', default: {x: 1, y: 1} },
        color: {type: 'color', default: '#787878'},
        useImageAsTexture: {type: 'boolean', default: true}
    },

    init: function () {
        this.loaderDiv = document.getElementById('loader');
        if (this.loaderDiv) this.loaderDiv.style.display = 'block';

        // Properties to store DEM data for other components
        this.demDataArray = null;
        this.demWidth = 0;
        this.demHeight = 0;
        this.isLoaded = false; // Flag to indicate if DEM data is ready

        this.loadDEM();
    },

    loadDEM: function () {
        const { demImagePath } = this.data;
        const imgLoader = new THREE.ImageLoader();
        // imgLoader.setCrossOrigin('anonymous');

        imgLoader.load(demImagePath,
            (image) => {
                this.demWidth = image.width;
                this.demHeight = image.height;

                const canvas = document.createElement('canvas');
                canvas.width = this.demWidth;
                canvas.height = this.demHeight;
                const context = canvas.getContext('2d');
                if (!context) {
                    console.error("Failed to get 2D context from canvas!");
                    if (this.loaderDiv) this.loaderDiv.textContent = 'Error: Canvas 2D context failed.';
                    return;
                }
                context.drawImage(image, 0, 0);

                let imageData;
                try {
                    imageData = context.getImageData(0, 0, this.demWidth, this.demHeight);
                } catch (e) {
                    console.error("Error getting imageData (potential CORS issue):", e);
                    if (this.loaderDiv) this.loaderDiv.textContent = 'Error getting image data. Check console.';
                    return;
                }
                this.demDataArray = imageData.data; // Store for sampling
                this.isLoaded = true; // Mark as loaded
                this.el.emit('dem-loaded', { // Emit an event that data is ready
                    width: this.demWidth,
                    height: this.demHeight,
                    data: this.demDataArray
                }, false);


                this.createTerrainMesh(this.demDataArray, this.demWidth, this.demHeight);
                if (this.loaderDiv) this.loaderDiv.style.display = 'none';
            },
            undefined,
            (error) => {
                console.error('An error occurred loading the DEM image:', error);
                if (this.loaderDiv) {
                    if (error.target && error.target.status === 404) {
                         this.loaderDiv.textContent = `Error 404: Image not found at ${demImagePath}. Check path.`;
                    } else if (error.message && error.message.includes('Access-Control-Allow-Origin')) {
                        this.loaderDiv.textContent = `CORS Error: Cannot load ${demImagePath}. Serve files from a web server or check CORS headers.`;
                    } else {
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
        const uvs = geometry.attributes.uv; // Get UVs for later mapping

        for (let i = 0; i < positions.count; i++) {
            // Get original plane X, Y (which are world X, Z after rotation)
            const planeX = positions.getX(i);
            const planeY = positions.getY(i); // This is original Y of plane, becomes Z for UV mapping

            // Use the UV attribute directly from PlaneGeometry.
            // PlaneGeometry UVs have (0,0) at bottom-left.
            // Image UVs often have (0,0) at top-left.
            let u = uvs.getX(i);
            let v = uvs.getY(i); // v is 0 at bottom, 1 at top of plane

            // To map to image (0,0 at top-left), we need to flip v if necessary.
            // The DEM data access uses (0,0) at top-left from canvas.
            // PlaneGeometry vertices go row by row, bottom-left to top-right.
            // Image data is typically stored top-to-bottom, left-to-right.
            // So, if plane's v=0 is image's v=1 (max_height), and plane's v=1 is image's v=0:
            // This depends on how you interpret your image data vs plane construction.
            // Let's assume current u,v from PlaneGeometry are fine for direct lookup if
            // we consider the DEM values directly without worrying about visual texture mapping inversion for a moment.
            // The critical part is that the height displacement logic in the loop should match
            // how getDEMValueAtUV will retrieve the data.

            // The UVs for displacement should match the UVs for sampling later.
            // The loop below uses a different u,v calculation than the geometry.attributes.uv.
            // Let's use the one from your original script for consistency for displacement.
            let displacement_u = (planeX / planeSize) + 0.5;
            let displacement_v = 1.0 - ((planeY / planeSize) + 0.5); // Invert V for image coordinates

            displacement_u = Math.max(0, Math.min(1, displacement_u));
            displacement_v = Math.max(0, Math.min(1, displacement_v));

            const demX = Math.floor(displacement_u * (demWidth - 1));
            const demY = Math.floor(displacement_v * (demHeight - 1));

            const pixelIndex = (demY * demWidth + demX) * 4;
            const grayscaleValue = demData[pixelIndex] / 255;

            positions.setZ(i, grayscaleValue * heightScale);
        }
        geometry.computeVertexNormals();

        let material;
        if (useImageAsTexture) {
            const textureLoader = new THREE.TextureLoader();
            const demTexture = textureLoader.load(demImagePath, (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(textureRepeat.x, textureRepeat.y);
                tex.needsUpdate = true;
            });
            material = new THREE.MeshStandardMaterial({
                map: demTexture,
                roughness: 0.9,
                metalness: 0.1,
                side: THREE.FrontSide
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
        terrainMesh.rotation.x = -Math.PI / 2;
        this.el.setObject3D('dem-mesh', terrainMesh);

        // Add 'collidable' class for raycaster if not present
        if (!this.el.classList.contains('collidable')) {
            this.el.classList.add('collidable');
        }
        console.log("DEM Terrain mesh added to A-Frame entity and marked collidable.");
    },

    /**
     * Gets the raw DEM value at the given UV coordinates.
     * UVs are expected to be in the range [0, 1], where (0,0) is typically top-left of the image.
     * The PlaneGeometry.attributes.uv has (0,0) at bottom-left, so conversion might be needed
     * depending on where the input UVs come from (e.g., raycaster.getIntersection).
     * @param {number} u - U coordinate [0, 1]
     * @param {number} v - V coordinate [0, 1] (0 at top, 1 at bottom of image typically)
     * @returns {number|null} The grayscale value (0-255) or null if data not ready or out of bounds.
     */
    getDEMValueAtUV: function (u, v) {
        if (!this.isLoaded || !this.demDataArray) {
            // console.warn("DEM data not loaded yet for sampling.");
            return null;
        }

        // Clamp UVs
        const u_clamped = Math.max(0, Math.min(1, u));
        // For v, if raycaster UVs are (0,0) at bottom-left of texture like PlaneGeometry,
        // and image data is (0,0) at top-left, we need to flip v.
        const v_clamped = Math.max(0, Math.min(1, v)); // Raycaster UVs are usually 0-1, (0,0) at one corner.

        // Map UV coordinates to DEM pixel coordinates
        // Ensure demWidth and demHeight are available
        const demX = Math.floor(u_clamped * (this.demWidth - 1));
        const demY = Math.floor(v_clamped * (this.demHeight - 1)); // v_clamped is used here.

        // Get grayscale value (assuming R, G, B are the same for grayscale)
        // Index = (y * width + x) * 4 (for RGBA)
        const pixelIndex = (demY * this.demWidth + demX) * 4;

        if (pixelIndex < 0 || pixelIndex >= this.demDataArray.length - 3) {
            // console.warn("Calculated pixelIndex is out of bounds:", pixelIndex);
            return null; // Out of bounds
        }
        const grayscaleValue = this.demDataArray[pixelIndex]; // R channel (0-255)
        return grayscaleValue;
    },

    remove: function () {
        this.el.removeObject3D('dem-mesh');
        if (this.loaderDiv) this.loaderDiv.style.display = 'none';
        this.isLoaded = false;
        this.demDataArray = null;
    }
});


// =====================================
// VR Value Sampler Component
// =====================================
AFRAME.registerComponent('vr-value-sampler', {
    schema: {
        demTerrainEl: { type: 'selector', default: '#dem-display' }, // Selector for the DEM terrain entity
        triggerEvent: { type: 'string', default: 'triggerdown' },   // Event to start sampling
        releaseEvent: { type: 'string', default: 'triggerup' },     // Event to stop sampling
        displayPanelEl: { type: 'selector', default: '#sampler-display-panel' } // Selector for the text display
    },

    init: function () {
        this.demTerrainComponent = null;
        this.displayPanelComponent = null;
        this.isSampling = false;
        this.raycasterEl = this.el; // Assuming raycaster is on this controller entity

        // Get DEM terrain component
        const demEl = this.data.demTerrainEl;
        if (demEl) {
            if (demEl.hasLoaded) {
                this.demTerrainComponent = demEl.components['dem-terrain'];
                 if (!this.demTerrainComponent) console.error("vr-value-sampler: dem-terrain component not found on", demEl.id);
            } else {
                demEl.addEventListener('loaded', () => {
                    this.demTerrainComponent = demEl.components['dem-terrain'];
                    if (!this.demTerrainComponent) console.error("vr-value-sampler: dem-terrain component not found on", demEl.id, "after load.");
                }, {once: true});
            }
             // Also listen for the custom 'dem-loaded' event from dem-terrain
            demEl.addEventListener('dem-loaded', () => {
                if(!this.demTerrainComponent) this.demTerrainComponent = demEl.components['dem-terrain'];
                // console.log("vr-value-sampler: DEM data is confirmed loaded by dem-terrain.");
            }, {once: true});
        } else {
            console.error("vr-value-sampler: demTerrainEl not found.");
        }


        // Get Display Panel component
        const panelEl = this.data.displayPanelEl;
        if (panelEl) {
            if (panelEl.hasLoaded) {
                this.displayPanelComponent = panelEl.components.text;
                if (!this.displayPanelComponent) console.error("vr-value-sampler: text component not found on display panel", panelEl.id);
                else panelEl.setAttribute('visible', false); // Hide initially
            } else {
                panelEl.addEventListener('loaded', () => {
                    this.displayPanelComponent = panelEl.components.text;
                    if (!this.displayPanelComponent) console.error("vr-value-sampler: text component not found on display panel", panelEl.id, "after load.");
                    else panelEl.setAttribute('visible', false); // Hide initially
                }, {once: true});
            }
        } else {
            console.error("vr-value-sampler: displayPanelEl not found.");
        }

        this.onTriggerDown = this.onTriggerDown.bind(this);
        this.onTriggerUp = this.onTriggerUp.bind(this);

        this.el.addEventListener(this.data.triggerEvent, this.onTriggerDown);
        this.el.addEventListener(this.data.releaseEvent, this.onTriggerUp);

        // Ensure raycaster is configured to intersect 'collidable'
        if (!this.raycasterEl.hasAttribute('raycaster')) {
            console.warn("vr-value-sampler: Controller element does not have a raycaster component. Adding a default one.");
            this.raycasterEl.setAttribute('raycaster', 'objects: .collidable; far: 50; showLine: true');
        } else {
            const currentRaycasterObjects = this.raycasterEl.getAttribute('raycaster').objects;
            if (currentRaycasterObjects && !currentRaycasterObjects.includes('.collidable')) {
                 this.raycasterEl.setAttribute('raycaster', 'objects', currentRaycasterObjects + ', .collidable');
            } else if (!currentRaycasterObjects) {
                 this.raycasterEl.setAttribute('raycaster', 'objects', '.collidable');
            }
        }
        // console.log("vr-value-sampler initialized for controller:", this.el.id);
    },

    onTriggerDown: function () {
        this.isSampling = true;
        if (this.data.displayPanelEl) this.data.displayPanelEl.setAttribute('visible', true);
        // console.log("Sampling started");
    },

    onTriggerUp: function () {
        this.isSampling = false;
        if (this.data.displayPanelEl) this.data.displayPanelEl.setAttribute('visible', false);
        // console.log("Sampling stopped");
    },

    tick: function () {
        if (!this.isSampling || !this.demTerrainComponent || !this.demTerrainComponent.isLoaded || !this.displayPanelComponent) {
            if (this.isSampling && this.data.displayPanelEl && this.data.displayPanelEl.getAttribute('visible')) {
                 // Keep display panel visible but maybe show "Waiting for DEM..."
                 if (!this.demTerrainComponent || !this.demTerrainComponent.isLoaded) {
                    this.displayPanelComponent.el.setAttribute('text', 'value', 'DEM loading...');
                 }
            }
            return;
        }

        const intersection = this.raycasterEl.components.raycaster.getIntersection(this.data.demTerrainEl);

        if (intersection) {
            const uv = intersection.uv; // This is THREE.Vector2, (0,0) is usually at a corner of the texture.
                                        // For PlaneGeometry, it's bottom-left.
            if (uv) {
                // DEM image data typically has (0,0) at top-left.
                // PlaneGeometry UVs have (0,0) at bottom-left.
                // So, if raycaster UVs match PlaneGeometry UVs, v_image = 1.0 - v_plane.
                const imageU = uv.x;
                const imageV = 1.0 - uv.y; // Flip V coordinate

                const value = this.demTerrainComponent.getDEMValueAtUV(imageU, imageV);

                if (value !== null) {
                    const worldPoint = intersection.point;
                    this.displayPanelComponent.el.setAttribute('text', 'value', `Value: ${value}\nPos: ${worldPoint.x.toFixed(2)}, ${worldPoint.y.toFixed(2)}, ${worldPoint.z.toFixed(2)}\nUV: ${imageU.toFixed(3)}, ${imageV.toFixed(3)}`);
                    // Position the panel near the intersection point or on the controller
                    // Example: Position on controller, slightly offset
                    // this.displayPanelComponent.el.setAttribute('position', '0.1 0 -0.1'); // Adjust as needed relative to controller
                } else {
                    this.displayPanelComponent.el.setAttribute('text', 'value', 'Out of bounds or\nDEM not ready');
                }
            } else {
                 this.displayPanelComponent.el.setAttribute('text', 'value', 'No UV data\nat intersection');
            }
        } else {
            this.displayPanelComponent.el.setAttribute('text', 'value', 'Point at DEM\n& hold trigger');
        }
    },

    remove: function () {
        this.el.removeEventListener(this.data.triggerEvent, this.onTriggerDown);
        this.el.removeEventListener(this.data.releaseEvent, this.onTriggerUp);
        if (this.data.displayPanelEl) this.data.displayPanelEl.setAttribute('visible', false);
    }
});

// ... (Make sure vr-dem-zoom and ar-scale-adjuster are here if you had them previously)

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

// =====================================
// VR DEM Zoom Component
// =====================================
AFRAME.registerComponent('vr-dem-zoom', {
    schema: {
        targetEl: { type: 'selector', default: '#ar-scale-adjuster-wrapper' }, // Entity to scale
        zoomSpeed: { type: 'number', default: 0.05 },   // How fast to zoom (adjust sensitivity)
        minScale: { type: 'number', default: 0.01 },    // Min uniform scale for the target
        maxScale: { type: 'number', default: 5.0 },     // Max uniform scale for the target
        inputEvents: { type: 'array', default: ['thumbstickmoved', 'axismove'] } // Events to listen for
    },

    init: function () {
        this.targetEntity = null;
        this.isVR = false;
        this.eventHandlers = {}; // To store bound event handlers for proper removal

        const targetSelector = this.data.targetEl;
        if (targetSelector) {
            if (targetSelector.hasLoaded) {
                this.targetEntity = targetSelector;
            } else {
                targetSelector.addEventListener('loaded', () => {
                    this.targetEntity = targetSelector;
                }, { once: true }); // Ensure listener is added only once
            }
        } else {
            // If the selector itself is null (e.g. invalid ID provided in HTML)
            const targetId = this.el.getAttribute('vr-dem-zoom')?.targetEl || this.data.targetEl; // Try to get raw string
            console.warn(`VR DEM Zoom: Target selector '${targetId}' did not initially find an entity. Will retry on scene load if it was a string.`);
            if (typeof targetId === 'string' && targetId.startsWith('#')) {
                this.el.sceneEl.addEventListener('loaded', () => {
                    this.targetEntity = document.querySelector(targetId);
                    if (!this.targetEntity) {
                        console.error(`VR DEM Zoom: Target entity '${targetId}' still not found after scene load.`);
                    }
                }, { once: true });
            }
        }


        this.onEnterVR = () => { this.isVR = true; };
        this.onExitVR = () => { this.isVR = false; };

        this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
        this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);

        this.data.inputEvents.forEach(eventName => {
            // Bind the handler to `this` context and store it
            const handler = this.handleControllerInput.bind(this);
            this.eventHandlers[eventName] = handler;
            this.el.addEventListener(eventName, handler);
        });
        // console.log("vr-dem-zoom initialized for controller:", this.el.id);
    },

    handleControllerInput: function (evt) {
        if (!this.isVR || !this.targetEntity) return;

        let stickY = 0;

        if (evt.type === 'thumbstickmoved' && evt.detail) {
            // A-Frame standard: evt.detail.y is negative for forward, positive for backward.
            stickY = evt.detail.y || 0;
            // console.log(this.el.id, "thumbstickmoved Y:", stickY);
        } else if (evt.type === 'axismove' && evt.detail && evt.detail.axis) {
            // axismove is more raw. The Y axis index can vary.
            // Assuming this component is on the RIGHT controller.
            // Oculus Touch right thumbstick Y is typically axis[3] (negative for forward).
            // Vive right trackpad Y can be axis[1] (after mapping).
            if (this.el.id && this.el.id.toLowerCase().includes('right')) {
                if (evt.detail.axis.length > 3) stickY = evt.detail.axis[3]; // Oculus right Y
                else if (evt.detail.axis.length > 1) stickY = evt.detail.axis[1]; // Vive right Y (mapped) or generic
            } else if (this.el.id && this.el.id.toLowerCase().includes('left')) {
                if (evt.detail.axis.length > 1) stickY = evt.detail.axis[1]; // Oculus/Vive left Y
            } else { // Fallback for unknown controller, try second reported axis
                if (evt.detail.axis.length > 1) stickY = evt.detail.axis[1];
            }
            // console.log(this.el.id, "axismove Y (raw):", stickY, "All axes:", evt.detail.axis);
        }


        if (Math.abs(stickY) > 0.05) { // Deadzone to prevent drift
            // If stickY is negative (thumbstick pushed forward), we want to zoom IN (increase scale).
            // If stickY is positive (thumbstick pulled backward), we want to zoom OUT (decrease scale).
            // Scale factor calculation:
            // Forward (stickY is neg): 1 - (negative * speed) = 1 + (positive_val) => scale > 1 (zoom in)
            // Backward (stickY is pos): 1 - (positive * speed) = 1 - (positive_val) => scale < 1 (zoom out)
            const scaleFactor = 1 - (stickY * this.data.zoomSpeed);
            this.updateScale(scaleFactor);
        }
    },

    updateScale: function (factor) {
        if (!this.targetEntity) {
            // console.warn("VR DEM Zoom: Attempted to update scale but targetEntity is null.");
            return;
        }

        const currentScale = this.targetEntity.object3D.scale; // Direct THREE.js Vector3 access
        let newScaleVal = currentScale.x * factor; // Assuming uniform scaling applied to x and then used for all

        newScaleVal = Math.min(Math.max(newScaleVal, this.data.minScale), this.data.maxScale);

        this.targetEntity.setAttribute('scale', { x: newScaleVal, y: newScaleVal, z: newScaleVal });
        // console.log("Target scale updated to:", newScaleVal);
    },

    remove: function () {
        // Clean up scene event listeners
        if (this.onEnterVR) this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
        if (this.onExitVR) this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);

        // Clean up controller event listeners
        this.data.inputEvents.forEach(eventName => {
            if (this.eventHandlers[eventName]) {
                this.el.removeEventListener(eventName, this.eventHandlers[eventName]);
            }
        });
        this.eventHandlers = {}; // Clear stored handlers
    }
});