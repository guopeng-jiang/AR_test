/* global AFRAME, THREE */

// =====================================
// AR/VR Scale Adjuster
// =====================================
AFRAME.registerComponent('ar-scale-adjuster', {
    schema: {
        arScale: { type: 'number', default: 0.05 },
        vrScale: { type: 'number', default: 0.5 },
        arYOffset: { type: 'number', default: 0 },
        vrYOffset: { type: 'number', default: 0 },
        defaultPosVR: { type: 'vec3', default: { x: 0, y: -1, z: -3 } },
        defaultPosAR: { type: 'vec3', default: { x: 0, y: -0.5, z: -1.5 } }
    },
    init: function() {
        this.sceneEl = this.el.sceneEl;
        this.defaultPositionVR = AFRAME.utils.clone(this.data.defaultPosVR);
        this.defaultPositionAR = AFRAME.utils.clone(this.data.defaultPosAR);
        
        this.onEnterXR = this.onEnterXR.bind(this);
        this.onExitXR = this.onExitXR.bind(this);
        this.checkXRMode = this.checkXRMode.bind(this);

        this.sceneEl.addEventListener('enter-vr', this.onEnterXR);
        this.sceneEl.addEventListener('exit-vr', this.onExitXR);

        this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
        this.checkURLParameters();
    },
    onEnterXR: function() {
        setTimeout(this.checkXRMode, 500);
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
                    this.applyTransform(this.data.arScale, this.defaultPositionAR.y + this.data.arYOffset, true);
                } else {
                    document.body.classList.add('vr-mode');
                    this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
                }
            }
        }
    },
    detectARMode: function(session) {
        return (session.environmentBlendMode === 'additive' || session.environmentBlendMode === 'alpha-blend');
    },
    checkURLParameters: function() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('ar') === 'true' || urlParams.get('passthrough') === 'true') {
            this.applyTransform(this.data.arScale, this.defaultPositionAR.y + this.data.arYOffset, true);
            document.body.classList.add('ar-mode');
        }
    },
    onExitXR: function() {
        this.applyTransform(this.data.vrScale, this.defaultPositionVR.y + this.data.vrYOffset, false);
        document.body.classList.remove('ar-mode', 'vr-mode');
        if (this.sceneEl.object3D) this.sceneEl.object3D.visible = true;
    },
    applyTransform: function(scale, yPos, isAR) {
        const basePosition = isAR ? this.defaultPositionAR : this.defaultPositionVR;
        this.el.setAttribute('scale', `${scale} ${scale} ${scale}`);
        this.el.setAttribute('position', { x: basePosition.x, y: yPos, z: basePosition.z });
    },
    remove: function() {
        this.sceneEl.removeEventListener('enter-vr', this.onEnterXR);
        this.sceneEl.removeEventListener('exit-vr', this.onExitXR);
    }
});

// =====================================
// DEM Terrain Component (With Cutout)
// =====================================
AFRAME.registerComponent('dem-terrain', {
    schema: {
        demImagePath: { type: 'string', default: 'grayscale_raster.png' },
        maxSize: { type: 'number', default: 50 }, 
        heightScale: { type: 'number', default: 10 },
        segments: { type: 'number', default: 199 },
        textureRepeat: { type: 'vec2', default: {x: 1, y: 1} },
        color: {type: 'color', default: '#787878'},
        useImageAsTexture: {type: 'boolean', default: true}
    },

    init: function () {
        this.loaderDiv = document.getElementById('loader');
        if (this.loaderDiv) this.loaderDiv.style.display = 'block';
        this.loadDEM();
    },

    loadDEM: function () {
        const { demImagePath } = this.data;
        const imgLoader = new THREE.ImageLoader();

        imgLoader.load(demImagePath,
            (image) => {
                const imgWidth = image.width;
                const imgHeight = image.height;
                const canvas = document.createElement('canvas');
                canvas.width = imgWidth;
                canvas.height = imgHeight;
                const context = canvas.getContext('2d');
                
                context.drawImage(image, 0, 0);

                try {
                    const imageData = context.getImageData(0, 0, imgWidth, imgHeight);
                    this.createTerrainMesh(imageData.data, imgWidth, imgHeight);
                    if (this.loaderDiv) this.loaderDiv.style.display = 'none';
                } catch (e) {
                    console.error("Canvas Security Error:", e);
                    if (this.loaderDiv) this.loaderDiv.textContent = 'Error: CORS/Security. Run via local server.';
                }
            },
            undefined,
            (error) => {
                console.error('Error loading DEM image:', error);
                if (this.loaderDiv) this.loaderDiv.textContent = 'Error loading image. See console.';
            }
        );
    },

    createTerrainMesh: function (demData, demWidth, demHeight) {
        const { maxSize, heightScale, segments, textureRepeat, color, useImageAsTexture, demImagePath } = this.data;

        // Calculate Aspect Ratio
        const ratio = demWidth / demHeight;
        let meshWidth, meshHeight;

        if (ratio >= 1) {
            meshWidth = maxSize;
            meshHeight = maxSize / ratio;
        } else {
            meshHeight = maxSize;
            meshWidth = maxSize * ratio;
        }

        const geometry = new THREE.PlaneGeometry(meshWidth, meshHeight, segments, segments);
        const positions = geometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i); 
            const y = positions.getY(i); 

            let u = (x / meshWidth) + 0.5;
            let v = 1.0 - ((y / meshHeight) + 0.5); 

            u = Math.max(0, Math.min(1, u));
            v = Math.max(0, Math.min(1, v));

            const demX = Math.floor(u * (demWidth - 1));
            const demY = Math.floor(v * (demHeight - 1));

            const pixelIndex = (demY * demWidth + demX) * 4;
            const grayscaleValue = demData[pixelIndex] / 255; 

            positions.setZ(i, grayscaleValue * heightScale);
        }
        geometry.computeVertexNormals();

        // Texture Loading for both Color and Transparency (Alpha)
        const textureLoader = new THREE.TextureLoader();
        let demTexture;
        
        // We load the texture regardless, as we need it for the Alpha Map
        demTexture = textureLoader.load(demImagePath, (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(textureRepeat.x, textureRepeat.y);
        });

        const materialConfig = {
            side: THREE.DoubleSide,
            // Key to making background invisible:
            alphaMap: demTexture, 
            alphaTest: 0.1,       // Discard anything darker than 10% grey
            transparent: false,   // Keep the rest solid (don't make the mountain ghostly)
            roughness: 1.0,
            metalness: 0.0
        };

        if (useImageAsTexture) {
            materialConfig.map = demTexture;
        } else {
            materialConfig.color = color;
        }

        const material = new THREE.MeshStandardMaterial(materialConfig);
        const terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2;
        
        // Shadow support
        terrainMesh.castShadow = true;
        terrainMesh.receiveShadow = true;

        this.el.meshWidth = meshWidth;
        this.el.meshHeight = meshHeight;
        
        this.el.setObject3D('dem-mesh', terrainMesh);
        this.el.emit('terrain-loaded', { width: meshWidth, height: meshHeight });
    },
    remove: function () {
        this.el.removeObject3D('dem-mesh');
    }
});

// =====================================
// Water / Ocean Component (With Masking)
// =====================================
AFRAME.registerComponent('water-helper', {
    schema: {
        level: { type: 'number', default: 1.5 },
        color: { type: 'color', default: '#006994' },
        opacity: { type: 'number', default: 0.75 },
        speed: { type: 'number', default: 1.0 },
        maskImagePath: { type: 'string', default: '' } 
    },
    init: function() {
        if (this.el.components['dem-terrain']) {
            this.el.addEventListener('terrain-loaded', (evt) => {
                this.createWater(evt.detail.width, evt.detail.height);
            });
        } else {
            this.createWater(50, 50);
        }
    },
    createWater: function(width, height) {
        const geometry = new THREE.PlaneGeometry(width, height, 64, 64);
        
        let maskPath = this.data.maskImagePath;
        if (!maskPath && this.el.components['dem-terrain']) {
            maskPath = this.el.components['dem-terrain'].data.demImagePath;
        }

        const textureLoader = new THREE.TextureLoader();
        const maskTexture = textureLoader.load(maskPath || 'grayscale_raster.png');

        const vertexShader = `
            varying vec2 vUv;
            uniform float uTime;
            void main() {
                vUv = uv;
                vec3 pos = position;
                float wave1 = sin(pos.x * 2.0 + uTime) * 0.1;
                float wave2 = cos(pos.y * 1.5 + uTime) * 0.1;
                pos.z += wave1 + wave2;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;

        const fragmentShader = `
            varying vec2 vUv;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uTime;
            uniform sampler2D tMask;

            void main() {
                // Sample DEM image to mask out water
                vec4 maskColor = texture2D(tMask, vUv);
                
                // If pixel is black (background), do not draw water
                if (maskColor.r < 0.1) {
                    discard;
                }

                float intensity = 1.0 + 0.2 * sin(vUv.x * 20.0 + uTime) * cos(vUv.y * 20.0 + uTime);
                gl_FragColor = vec4(uColor * intensity, uOpacity);
            }
        `;

        this.uniforms = {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(this.data.color) },
            uOpacity: { value: this.data.opacity },
            tMask: { value: maskTexture }
        };

        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            side: THREE.DoubleSide
        });

        const waterMesh = new THREE.Mesh(geometry, material);
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.y = this.data.level;
        
        this.el.object3D.add(waterMesh);
        this.waterMesh = waterMesh;
    },
    tick: function(time, timeDelta) {
        if (this.uniforms) {
            this.uniforms.uTime.value += (timeDelta / 1000) * this.data.speed;
        }
    },
    remove: function() {
        if (this.waterMesh) this.el.object3D.remove(this.waterMesh);
    }
});

// =====================================
// Stars Component
// =====================================
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
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.8
        });
        const stars = new THREE.Points(geometry, material);
        this.el.setObject3D('stars-points', stars);
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
        targetEl: { type: 'selector', default: '#ar-scale-adjuster-wrapper' },
        speed: { type: 'number', default: 1.0 }, 
        minScale: { type: 'number', default: 0.05 },
        maxScale: { type: 'number', default: 5.0 }
    },

    init: function () {
        this.zoomDirection = 0; 
        this.targetEntity = this.data.targetEl;
        this.onThumbstickMoved = this.onThumbstickMoved.bind(this);
        this.onEnterVR = () => { this.isVR = true; };
        this.onExitVR = () => { this.isVR = false; };

        this.el.addEventListener('thumbstickmoved', this.onThumbstickMoved);
        this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
        this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);
    },

    onThumbstickMoved: function(evt) {
        const y = evt.detail.y;
        if (Math.abs(y) > 0.1) {
            this.zoomDirection = y; 
        } else {
            this.zoomDirection = 0;
        }
    },

    tick: function (time, timeDelta) {
        if (!this.isVR || !this.targetEntity || this.zoomDirection === 0) return;
        const s = this.data.speed * (timeDelta / 1000); 
        const scaleFactor = 1 - (this.zoomDirection * s);
        const currentScale = this.targetEntity.object3D.scale;
        let newS = currentScale.x * scaleFactor;
        newS = Math.min(Math.max(newS, this.data.minScale), this.data.maxScale);
        this.targetEntity.setAttribute('scale', { x: newS, y: newS, z: newS });
    },

    remove: function () {
        this.el.removeEventListener('thumbstickmoved', this.onThumbstickMoved);
        this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
        this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
    }
});