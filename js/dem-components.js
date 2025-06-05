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
// VR Value Sampler Component (REVISED)
// =====================================
AFRAME.registerComponent('vr-value-sampler', {
    schema: {
        demTerrainEl: { type: 'selector', default: '#dem-display' },
        triggerEvent: { type: 'string', default: 'triggerdown' },
        releaseEvent: { type: 'string', default: 'triggerup' },
        displayPanelEl: { type: 'selector', default: '#sampler-display-panel' }
    },

    init: function () {
        this.demTerrainComponent = null;
        this.demTerrainEntity = null; // Store the entity itself for raycaster
        this.displayPanelEntity = null; // Store the entity for visibility toggling
        this.displayPanelTextComponent = null; // Store the text component for updates

        this.isSampling = false;
        this.raycasterEl = this.el; // Assuming raycaster is on this controller entity
        this.raycasterLineEl = this.el.querySelector('.raycaster-line'); // For explicit line

        console.log("vr-value-sampler: Initializing for controller:", this.el.id);

        // Get DEM terrain entity and component
        const demEl = this.data.demTerrainEl;
        if (demEl) {
            this.demTerrainEntity = demEl; // Store entity for raycaster
            const setupDemTerrain = () => {
                this.demTerrainComponent = demEl.components['dem-terrain'];
                if (!this.demTerrainComponent) {
                    console.error("vr-value-sampler: dem-terrain component NOT FOUND on", demEl.id);
                } else {
                    console.log("vr-value-sampler: dem-terrain component found on", demEl.id);
                    if (!this.demTerrainComponent.isLoaded) {
                        console.log("vr-value-sampler: Waiting for 'dem-loaded' event from", demEl.id);
                        demEl.addEventListener('dem-loaded', () => {
                            console.log("vr-value-sampler: 'dem-loaded' event received from", demEl.id);
                        }, { once: true });
                    } else {
                         console.log("vr-value-sampler: DEM terrain already loaded.");
                    }
                }
            };
            if (demEl.hasLoaded) {
                setupDemTerrain();
            } else {
                demEl.addEventListener('loaded', setupDemTerrain, { once: true });
            }
        } else {
            console.error("vr-value-sampler: demTerrainEl selector '" + this.data.demTerrainEl + "' did not find an entity.");
        }

        // Get Display Panel entity and text component
        const panelEl = this.data.displayPanelEl;
        if (panelEl) {
            this.displayPanelEntity = panelEl; // Store entity for visibility
            const setupDisplayPanel = () => {
                this.displayPanelTextComponent = panelEl.components.text;
                if (!this.displayPanelTextComponent) {
                    console.error("vr-value-sampler: text component NOT FOUND on display panel", panelEl.id);
                } else {
                    console.log("vr-value-sampler: Display panel text component found.");
                    panelEl.setAttribute('visible', false); // Hide initially
                }
            };
            if (panelEl.hasLoaded) {
                setupDisplayPanel();
            } else {
                panelEl.addEventListener('loaded', setupDisplayPanel, { once: true });
            }
        } else {
            console.error("vr-value-sampler: displayPanelEl selector '" + this.data.displayPanelEl + "' did not find an entity.");
        }

        this.onTriggerDown = this.onTriggerDown.bind(this);
        this.onTriggerUp = this.onTriggerUp.bind(this);

        this.el.addEventListener(this.data.triggerEvent, this.onTriggerDown);
        this.el.addEventListener(this.data.releaseEvent, this.onTriggerUp);

        // Ensure raycaster is configured correctly
        if (!this.raycasterEl.hasAttribute('raycaster')) {
            console.warn("vr-value-sampler: Controller element does not have a raycaster. Adding default: objects: .collidable; far: 50;");
            this.raycasterEl.setAttribute('raycaster', 'objects: .collidable; far: 50;');
        } else {
            let rcAttr = this.raycasterEl.getAttribute('raycaster');
            if (!rcAttr.objects || !rcAttr.objects.includes('.collidable')) {
                const newObjects = rcAttr.objects ? rcAttr.objects + ', .collidable' : '.collidable';
                this.raycasterEl.setAttribute('raycaster', 'objects', newObjects);
                console.log("vr-value-sampler: Updated raycaster 'objects' to include '.collidable'");
            }
        }
        if (this.raycasterLineEl) {
            console.log("vr-value-sampler: Explicit raycaster line found.");
            this.raycasterLineEl.setAttribute('visible', true); // Show line when controller is active
        } else {
            console.warn("vr-value-sampler: Explicit .raycaster-line child NOT found. Visual line might not appear as configured.");
        }
    },

    onTriggerDown: function (evt) {
        console.log("vr-value-sampler: Trigger DOWN detected on " + this.el.id);
        this.isSampling = true;
        if (this.displayPanelEntity) {
            this.displayPanelEntity.setAttribute('visible', true);
            console.log("vr-value-sampler: Display panel visibility set to true.");
            // Update text immediately on trigger down if not intersecting
             if (this.displayPanelTextComponent) {
                this.displayPanelTextComponent.el.setAttribute('text', 'value', 'Sampling...');
            }
        } else {
            console.warn("vr-value-sampler: No display panel entity to make visible on trigger down.");
        }
    },

    onTriggerUp: function (evt) {
        console.log("vr-value-sampler: Trigger UP detected on " + this.el.id);
        this.isSampling = false;
        if (this.displayPanelEntity) {
            this.displayPanelEntity.setAttribute('visible', false);
            console.log("vr-value-sampler: Display panel visibility set to false.");
        } else {
            console.warn("vr-value-sampler: No display panel entity to hide on trigger up.");
        }
    },

    tick: function () {
        const raycasterComponent = this.raycasterEl.components.raycaster;
        if (!raycasterComponent) return; // Raycaster not ready

        let intersection = null;
        if (this.demTerrainEntity && this.demTerrainEntity.object3D) { // Ensure entity and its 3D object are ready
             // Check if demTerrainEntity is actually in the raycaster's list of objects
            if (raycasterComponent.intersectedEls.includes(this.demTerrainEntity)) {
                // More direct way to get the specific intersection if you know the target
                for (let i = 0; i < raycasterComponent.intersections.length; i++) {
                    if (raycasterComponent.intersections[i].object.el === this.demTerrainEntity) {
                        intersection = raycasterComponent.intersections[i];
                        break;
                    }
                }
            }
            // Fallback if the above doesn't work (e.g. older A-Frame or race condition)
            if (!intersection) {
                 intersection = raycasterComponent.getIntersection(this.demTerrainEntity);
            }
        }


        // Update explicit raycaster line
        if (this.raycasterLineEl) {
            this.raycasterLineEl.setAttribute('visible', true); // Keep line visible while controller is active
            let lineEnd;
            if (intersection) {
                let localIntersectionPoint = new THREE.Vector3();
                this.el.object3D.worldToLocal(localIntersectionPoint.copy(intersection.point));
                lineEnd = localIntersectionPoint;
            } else {
                const direction = raycasterComponent.data.direction; // THREE.Vector3
                const far = raycasterComponent.data.far;
                // Create a new vector for calculation to avoid modifying the original
                lineEnd = new THREE.Vector3(direction.x, direction.y, direction.z).multiplyScalar(far);
            }
            this.raycasterLineEl.setAttribute('line', 'end', `${lineEnd.x} ${lineEnd.y} ${lineEnd.z}`);
        }

        if (!this.isSampling) {
            return; // Not holding trigger, do nothing further with display panel
        }

        // --- From here, we are sampling (trigger is held) ---

        if (!this.displayPanelEntity || !this.displayPanelTextComponent) {
            // console.warn("vr-value-sampler: Display panel not ready for update.");
            return;
        }
        // Ensure panel is visible if sampling (might have been missed by onTriggerDown if components weren't ready)
        if (!this.displayPanelEntity.getAttribute('visible')) {
            this.displayPanelEntity.setAttribute('visible', true);
        }


        if (!this.demTerrainComponent || !this.demTerrainComponent.isLoaded) {
            this.displayPanelTextComponent.el.setAttribute('text', 'value', 'DEM loading...');
            return;
        }

        if (intersection) {
            const uv = intersection.uv; // THREE.Vector2
            if (uv) {
                const imageU = uv.x;
                const imageV = 1.0 - uv.y; // Flip V for image coords (0,0 at top-left)

                const value = this.demTerrainComponent.getDEMValueAtUV(imageU, imageV);

                if (value !== null) {
                    const worldPoint = intersection.point;
                    this.displayPanelTextComponent.el.setAttribute('text', 'value',
                        `Value: ${value}\nPos: ${worldPoint.x.toFixed(1)}, ${worldPoint.y.toFixed(1)}, ${worldPoint.z.toFixed(1)}\nUV: ${imageU.toFixed(2)}, ${imageV.toFixed(2)}`
                    );
                } else {
                    this.displayPanelTextComponent.el.setAttribute('text', 'value', 'Out of DEM bounds\nor data error');
                }
            } else {
                this.displayPanelTextComponent.el.setAttribute('text', 'value', 'No UV data\nat intersection');
            }
        } else {
            this.displayPanelTextComponent.el.setAttribute('text', 'value', 'Point at DEM');
        }
    },

    remove: function () {
        console.log("vr-value-sampler: Removing listeners for " + this.el.id);
        this.el.removeEventListener(this.data.triggerEvent, this.onTriggerDown);
        this.el.removeEventListener(this.data.releaseEvent, this.onTriggerUp);
        if (this.displayPanelEntity) {
            this.displayPanelEntity.setAttribute('visible', false);
        }
        if (this.raycasterLineEl) {
            this.raycasterLineEl.setAttribute('visible', false);
        }
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