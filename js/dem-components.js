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
// DEM Terrain Component (With Depth Classification)
// =====================================
AFRAME.registerComponent('dem-terrain', {
    schema: {
        demImagePath: { type: 'string', default: 'grayscale_raster.png' },
        maxSize: { type: 'number', default: 50 }, 
        heightScale: { type: 'number', default: 10 },
        segments: { type: 'number', default: 199 },
        textureRepeat: { type: 'vec2', default: {x: 1, y: 1} },
        color: {type: 'color', default: '#787878'},
        useImageAsTexture: {type: 'boolean', default: true},
        
        // Depth Classification Settings
        visualizeDepth: { type: 'boolean', default: false },
        waterLevel: { type: 'number', default: 2.5 },
        landColor: { type: 'color', default: '#4B4642' },
        shallowColor: { type: 'color', default: '#76B6C4' },
        deepColor: { type: 'color', default: '#001E36' }
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
        const { maxSize, heightScale, segments, textureRepeat, color, useImageAsTexture, demImagePath, visualizeDepth, waterLevel } = this.data;

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
        const count = positions.count;
        
        // Colors
        const colors = [];
        const cLand = new THREE.Color(this.data.landColor);
        const cShallow = new THREE.Color(this.data.shallowColor);
        const cDeep = new THREE.Color(this.data.deepColor);

        for (let i = 0; i < count; i++) {
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
            const height = grayscaleValue * heightScale;

            positions.setZ(i, height);

            if (visualizeDepth) {
                if (height >= waterLevel) {
                    // It is strictly Land
                    colors.push(cLand.r, cLand.g, cLand.b);
                } else {
                    // It is Underwater
                    // Normalize height: 0 (Deepest) to 1 (Surface/waterLevel)
                    let t = height / waterLevel;
                    t = Math.max(0.0, Math.min(1.0, t));

                    // Interpolate: 0 -> Deep, 1 -> Shallow
                    const mix = cDeep.clone().lerp(cShallow, t);
                    colors.push(mix.r, mix.g, mix.b);
                }
            }
        }
        
        geometry.computeVertexNormals();
        
        if (visualizeDepth) {
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        }

        const textureLoader = new THREE.TextureLoader();
        let demTexture;

        const materialConfig = {
            side: THREE.DoubleSide,
            roughness: 1.0,
            metalness: 0.0,
            vertexColors: visualizeDepth
        };

        if (visualizeDepth) {
            // When visualizing depth, we force white base color so vertex colors pop
            // We also disable the alpha map/texture to prevent holes in deep water (black pixels)
            materialConfig.color = 0xffffff;
            materialConfig.map = null;
            materialConfig.alphaMap = null;
        } else {
            // Standard Texture Mode
            demTexture = textureLoader.load(demImagePath, (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(textureRepeat.x, textureRepeat.y);
            });
            
            materialConfig.alphaMap = demTexture; 
            materialConfig.alphaTest = 0.1;
            
            if (useImageAsTexture) {
                materialConfig.map = demTexture;
            } else {
                materialConfig.color = color;
            }
        }

        const material = new THREE.MeshStandardMaterial(materialConfig);
        const terrainMesh = new THREE.Mesh(geometry, material);
        terrainMesh.rotation.x = -Math.PI / 2;
        
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
// Depth Legend Component
// =====================================
AFRAME.registerComponent('depth-legend', {
    schema: {
        title: { type: 'string', default: 'Lake Depth' },
        minLabel: { type: 'string', default: '0m' },
        maxLabel: { type: 'string', default: '-243m' },
        shallowColor: { type: 'color', default: '#76B6C4' },
        deepColor: { type: 'color', default: '#001E36' }
    },
    init: function() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, 256, 512);

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.data.title, 128, 50);

        // Gradient Bar
        const grad = ctx.createLinearGradient(0, 80, 0, 450);
        grad.addColorStop(0, this.data.shallowColor);
        grad.addColorStop(1, this.data.deepColor);

        ctx.fillStyle = grad;
        ctx.fillRect(40, 80, 60, 370);

        // Labels
        ctx.fillStyle = '#CCCCCC';
        ctx.font = '24px Arial';
        ctx.textAlign = 'left';
        
        // Ticks
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const y = 80 + (i * (370 / steps));
            // Simple interpolation for label text if numeric, otherwise just top/bottom
            let text = "";
            if (i === 0) text = this.data.minLabel;
            else if (i === steps) text = this.data.maxLabel;
            else {
                // Approximate depths
                const val = Math.round((243 / steps) * i);
                text = `-${val}m`;
            }
            
            // Draw tick line
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(100, y, 10, 2);
            
            // Draw Text
            ctx.fillText(text, 120, y + 8);
        }

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({ 
            map: texture, 
            transparent: true 
        });
        const geometry = new THREE.PlaneGeometry(1, 2);
        
        const mesh = new THREE.Mesh(geometry, material);
        this.el.setObject3D('legend-mesh', mesh);
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

// =====================================
// Cloud / Mist Layer Component
// =====================================
AFRAME.registerComponent('cloud-layer', {
    schema: {
        altitude: { type: 'number', default: 2.2 }, // Slightly above water
        color: { type: 'color', default: '#FFFFFF' },
        opacity: { type: 'number', default: 0.4 },
        speed: { type: 'number', default: 0.05 },
        scale: { type: 'number', default: 1.0 } // How "puffy" the clouds are
    },
    init: function() {
        // Wait for terrain to load to get dimensions, or default to 50x50
        if (this.el.components['dem-terrain']) {
            this.el.addEventListener('terrain-loaded', (evt) => {
                this.createClouds(evt.detail.width, evt.detail.height);
            });
        } else {
            this.createClouds(50, 50);
        }
    },
    createClouds: function(width, height) {
        const geometry = new THREE.PlaneGeometry(width, height, 1, 1);

        // GLSL Shader for procedural noise clouds
        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uScale;
            varying vec2 vUv;

            // Simple pseudo-random noise
            float random (in vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            // 2D Noise
            float noise (in vec2 st) {
                vec2 i = floor(st);
                vec2 f = fract(st);
                float a = random(i);
                float b = random(i + vec2(1.0, 0.0));
                float c = random(i + vec2(0.0, 1.0));
                float d = random(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }

            // Fractal Brownian Motion (Cloud texture)
            float fbm (in vec2 st) {
                float value = 0.0;
                float amplitude = 0.5;
                float frequency = 0.0;
                // Loop of octaves
                for (int i = 0; i < 5; i++) {
                    value += amplitude * noise(st);
                    st *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                // Animate coordinates
                vec2 uv = vUv * (3.0 * uScale);
                uv.x += uTime * 0.1; 
                uv.y += uTime * 0.05;

                // Generate Cloud Pattern
                float n = fbm(uv);
                
                // Vignette (Fade edges so it doesn't look like a square)
                float dist = distance(vUv, vec2(0.5));
                float mask = smoothstep(0.5, 0.2, dist);

                // Mix color
                vec3 finalColor = uColor + (n * 0.2); 
                
                // Calculate Alpha (only show lighter parts of noise)
                float alpha = smoothstep(0.3, 0.8, n) * uOpacity * mask;

                gl_FragColor = vec4(finalColor, alpha);
            }
        `;

        this.uniforms = {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(this.data.color) },
            uOpacity: { value: this.data.opacity },
            uScale: { value: this.data.scale }
        };

        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false, // Don't block objects behind it
            side: THREE.DoubleSide
        });

        const cloudMesh = new THREE.Mesh(geometry, material);
        cloudMesh.rotation.x = -Math.PI / 2;
        cloudMesh.position.y = this.data.altitude;
        
        this.el.object3D.add(cloudMesh);
        this.cloudMesh = cloudMesh;
    },
    tick: function(time, timeDelta) {
        if (this.uniforms) {
            this.uniforms.uTime.value += (timeDelta / 1000) * this.data.speed;
        }
    },
    remove: function() {
        if (this.cloudMesh) this.el.object3D.remove(this.cloudMesh);
    }
});

// =====================================
// Floating Ice / Icebergs Component
// =====================================
AFRAME.registerComponent('floating-ice', {
    schema: {
        count: { type: 'number', default: 20 },
        minSize: { type: 'number', default: 0.5 },
        maxSize: { type: 'number', default: 2.0 },
        waterLevel: { type: 'number', default: 2.5 }, // Must match water-helper
        color: { type: 'color', default: '#E0F6FF' }  // Very pale ice blue
    },
    init: function() {
        this.icebergs = [];
        this.terrainMesh = null;
        this.terrainDims = { w: 50, h: 50 };

        // Wait for terrain to load to find deep water spots
        if (this.el.components['dem-terrain']) {
            this.el.addEventListener('terrain-loaded', (evt) => {
                this.terrainMesh = this.el.getObject3D('dem-mesh');
                this.terrainDims.w = evt.detail.width;
                this.terrainDims.h = evt.detail.height;
                
                // Allow matrices to update before raycasting
                setTimeout(() => {
                    this.spawnIce();
                }, 100);
            });
        }
    },
    spawnIce: function() {
        if (!this.terrainMesh) return;

        // Use Dodecahedron for a "chunky" low-poly ice look
        const geometry = new THREE.DodecahedronGeometry(1, 0); 
        const material = new THREE.MeshStandardMaterial({ 
            color: this.data.color, 
            roughness: 0.2,
            metalness: 0.1,
            flatShading: true
        });

        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        
        let placed = 0;
        let attempts = 0;

        // Try to place icebergs
        while (placed < this.data.count && attempts < this.data.count * 15) {
            attempts++;
            
            // Random position
            const x = (Math.random() - 0.5) * this.terrainDims.w;
            const z = (Math.random() - 0.5) * this.terrainDims.h;

            // Raycast down from water level
            raycaster.set(new THREE.Vector3(x, this.data.waterLevel, z), down);
            // intersectObject(object, recursive)
            const intersects = raycaster.intersectObject(this.terrainMesh, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                const terrainHeight = hit.point.y;

                // Check depth: Only spawn if water is at least 1m deep here
                if (this.data.waterLevel - terrainHeight > 1.0) {
                    
                    const ice = new THREE.Mesh(geometry, material);
                    
                    // Random Size (flattened slightly to float)
                    const s = this.data.minSize + Math.random() * (this.data.maxSize - this.data.minSize);
                    ice.scale.set(s, s * 0.6, s);

                    // Position: slightly submerged
                    const yPos = this.data.waterLevel - (s * 0.2);
                    ice.position.set(x, yPos, z);

                    // Random Rotation
                    ice.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

                    // Animation Data
                    ice.userData = {
                        baseY: yPos,
                        bobSpeed: 0.5 + Math.random(),
                        bobOffset: Math.random() * 10,
                        rotSpeed: (Math.random() - 0.5) * 0.005
                    };

                    this.el.object3D.add(ice);
                    this.icebergs.push(ice);
                    placed++;
                }
            }
        }
    },
    tick: function(t, dt) {
        const time = t / 1000;
        this.icebergs.forEach(ice => {
            // Gentle Bobbing
            ice.position.y = ice.userData.baseY + Math.sin(time * ice.userData.bobSpeed + ice.userData.bobOffset) * 0.05;
            // Very slow rotation
            ice.rotation.y += ice.userData.rotSpeed;
        });
    },
    remove: function() {
        this.icebergs.forEach(ice => this.el.object3D.remove(ice));
        this.icebergs = [];
    }
});