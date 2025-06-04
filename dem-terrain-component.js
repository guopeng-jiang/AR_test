AFRAME.registerComponent('dem-terrain', {
    schema: {
        demImage: { type: 'string', default: '' },
        planeSize: { type: 'number', default: 10 },
        heightScale: { type: 'number', default: 1 },
        segments: { type: 'number', default: 99 }
    },

    init: function () {
        this.el.sceneEl.emit('dem-loading-start', null, false); // Global event for loader
        console.log("DEM Terrain: Initializing component for image:", this.data.demImage);

        if (!this.data.demImage) {
            console.warn('DEM Terrain: demImage path not provided.');
            this.el.sceneEl.emit('dem-loading-end', { success: false, error: 'No image path' }, false);
            this.el.emit('dem-terrain-loaded', { success: false, error: 'No image path' }, false);
            return;
        }

        const planeWidth = this.data.planeSize;
        const planeHeight = this.data.planeSize;
        const widthSegments = Math.min(255, Math.floor(this.data.segments));
        const heightSegments = Math.min(255, Math.floor(this.data.segments));

        this.el.setAttribute('geometry', {
            primitive: 'plane',
            width: planeWidth,
            height: planeHeight,
            segmentsWidth: widthSegments,
            segmentsHeight: heightSegments
        });

        this.el.setAttribute('material', {
            shader: 'standard',
            color: '#999999',
            roughness: 0.9,
            metalness: 0.1,
            side: 'double'
        });

        this.loadDEM();
    },

    loadDEM: function () {
        const self = this;
        const imgLoader = new THREE.ImageLoader();
        console.log("DEM Terrain: Attempting to load image:", self.data.demImage);

        imgLoader.load(self.data.demImage,
            function (image) { // Success
                console.log('DEM Terrain: Image loaded successfully -', image.width, 'x', image.height);
                const imgWidth = image.width;
                const imgHeight = image.height;

                const canvas = document.createElement('canvas');
                canvas.width = imgWidth;
                canvas.height = imgHeight;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) {
                    console.error("DEM Terrain: Failed to get 2D context for DEM processing.");
                    self.el.sceneEl.emit('dem-loading-end', { success: false, error: 'Canvas context failed' }, false);
                    self.el.emit('dem-terrain-loaded', { success: false, error: 'Canvas context failed' }, false);
                    return;
                }
                context.drawImage(image, 0, 0);

                let imageData;
                try {
                    imageData = context.getImageData(0, 0, imgWidth, imgHeight);
                } catch (e) {
                    console.error("DEM Terrain: Error getting image data (CORS issue if not served via HTTP/S?):", e);
                    self.el.sceneEl.emit('dem-loading-end', { success: false, error: 'getImageData failed (CORS?)' }, false);
                    self.el.emit('dem-terrain-loaded', { success: false, error: 'getImageData failed (CORS?)' }, false);
                    return;
                }

                const demPixelData = imageData.data;
                self.applyHeightDataToMesh(demPixelData, imgWidth, imgHeight);

                // Optionally use the DEM image as a texture for color
                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(self.data.demImage, (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    const mesh = self.el.getObject3D('mesh');
                    if (mesh && mesh.material) {
                        mesh.material.map = texture;
                        mesh.material.needsUpdate = true;
                        console.log('DEM Terrain: Texture applied to material.');
                    }
                }, undefined, (err) => {
                    console.warn("DEM Terrain: Could not load DEM image as texture:", err);
                });

            },
            undefined, // onProgress
            function (error) { // Error
                console.error('DEM Terrain: Error loading DEM image resource:', error);
                self.el.sceneEl.emit('dem-loading-end', { success: false, error: 'Image load failed' }, false);
                self.el.emit('dem-terrain-loaded', { success: false, error: 'Image load failed' }, false);
            }
        );
    },

    applyHeightDataToMesh: function (demPixelData, demWidth, demHeight) {
        const mesh = this.el.getObject3D('mesh');
        if (!mesh || !mesh.geometry) {
            console.error('DEM Terrain: Mesh or geometry not found on entity for height application.');
            this.el.sceneEl.emit('dem-loading-end', { success: false, error: 'Mesh not found for height data' }, false);
            this.el.emit('dem-terrain-loaded', { success: false, error: 'Mesh not found for height data' }, false);
            return;
        }

        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        const planeSize = this.data.planeSize;
        const heightScale = this.data.heightScale;

        if (!positions) {
            console.error('DEM Terrain: Position attribute not found on geometry.');
            this.el.sceneEl.emit('dem-loading-end', { success: false, error: 'Position attribute missing' }, false);
            this.el.emit('dem-terrain-loaded', { success: false, error: 'Position attribute missing' }, false);
            return;
        }

        console.log(`DEM Terrain: Applying height data. Vertices: ${positions.count}, DEM Res: ${demWidth}x${demHeight}`);

        for (let i = 0; i < positions.count; i++) {
            const localX = positions.getX(i);
            const localY = positions.getY(i);

            let u = (localX / planeSize) + 0.5;
            let v = 1.0 - ((localY / planeSize) + 0.5);

            u = Math.max(0, Math.min(1, u));
            v = Math.max(0, Math.min(1, v));

            const demX = Math.floor(u * (demWidth - 1));
            const demY = Math.floor(v * (demHeight - 1));

            const pixelIndex = (demY * demWidth + demX) * 4;
            const grayscaleValue = demPixelData[pixelIndex] / 255.0;

            positions.setZ(i, grayscaleValue * heightScale);
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        console.log('DEM Terrain: Mesh geometry updated with height data.');
        this.el.sceneEl.emit('dem-loading-end', { success: true }, false);
        this.el.emit('dem-terrain-loaded', { success: true, message: 'DEM terrain processed and mesh updated' }, false);
    },

    remove: function () {
        // Clean up, if necessary
    }
});