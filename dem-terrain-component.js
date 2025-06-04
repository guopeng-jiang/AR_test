AFRAME.registerComponent('dem-terrain', {
    schema: {
        demImage: { type: 'string', default: '' },         // Path to the DEM image
        planeSize: { type: 'number', default: 10 },       // Visual size of the terrain
        heightScale: { type: 'number', default: 1 },      // Elevation exaggeration
        segments: { type: 'number', default: 99 }         // Resolution (segments = vertices - 1)
                                                          // Max 255 for PlaneGeometry with default UVs
    },

    init: function () {
        this.loaderDiv = document.getElementById('loader');
        if (this.loaderDiv) this.loaderDiv.style.display = 'block';

        this.material = null; // Will be set after mesh is ready

        if (!this.data.demImage) {
            console.warn('DEM Terrain: demImage path not provided.');
            if (this.loaderDiv) this.loaderDiv.style.display = 'none';
            return;
        }

        // Create the plane geometry that we will modify
        // A-Frame's <a-plane> creates its own geometry. We'll modify it.
        // We need to wait for the entity's mesh to be available.
        this.el.addEventListener('model-loaded', this.onModelLoaded.bind(this)); // For <a-gltf-model>
        // For primitives like <a-plane>, the mesh is usually ready faster.
        // We'll set up the geometry directly for <a-plane>.

        const planeWidth = this.data.planeSize;
        const planeHeight = this.data.planeSize; // Assuming square
        const widthSegments = Math.min(255, Math.floor(this.data.segments)); // PlaneGeometry limit
        const heightSegments = Math.min(255, Math.floor(this.data.segments));

        // Set up the A-Frame entity as a plane
        this.el.setAttribute('geometry', {
            primitive: 'plane',
            width: planeWidth,
            height: planeHeight,
            segmentsWidth: widthSegments,
            segmentsHeight: heightSegments
        });

        // The material can be set directly on the entity, or after loading texture
        this.el.setAttribute('material', {
            shader: 'standard', // Use a standard physically based material
            color: '#999999',   // Default color if texture fails or for base
            roughness: 0.9,
            metalness: 0.1,
            side: 'double'      // Important for terrains if viewed from below
        });


        this.loadDEM();
    },

    loadDEM: function () {
        const self = this; // For use in callbacks
        const imgLoader = new THREE.ImageLoader();

        imgLoader.load(this.data.demImage,
            function (image) { // Success
                console.log('DEM Image loaded:', image.width, 'x', image.height);
                const imgWidth = image.width;
                const imgHeight = image.height;

                const canvas = document.createElement('canvas');
                canvas.width = imgWidth;
                canvas.height = imgHeight;
                const context = canvas.getContext('2d', { willReadFrequently: true }); // For frequent getImageData
                if (!context) {
                    console.error("Failed to get 2D context for DEM processing.");
                    if (self.loaderDiv) self.loaderDiv.style.display = 'none';
                    return;
                }
                context.drawImage(image, 0, 0);

                let imageData;
                try {
                    imageData = context.getImageData(0, 0, imgWidth, imgHeight);
                } catch (e) {
                    console.error("Error getting image data (CORS issue if not served via HTTP/S?):", e);
                    if (self.loaderDiv) self.loaderDiv.textContent = 'Error: Could not read image data. Ensure it is served via HTTP/S.';
                    return;
                }

                const demPixelData = imageData.data;
                self.applyHeightDataToMesh(demPixelData, imgWidth, imgHeight);

                // Optionally use the DEM image as a texture for color
                const textureLoader = new THREE.TextureLoader();
                textureLoader.load(self.data.demImage, (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    self.el.getObject3D('mesh').material.map = texture;
                    self.el.getObject3D('mesh').material.needsUpdate = true;
                    console.log('DEM texture applied to material.');
                });


                if (self.loaderDiv) self.loaderDiv.style.display = 'none';
            },
            undefined, // onProgress
            function (error) { // Error
                console.error('Error loading DEM image:', error);
                if (self.loaderDiv) {
                    self.loaderDiv.textContent = 'Error loading DEM image. Check console.';
                    // Keep loader visible or provide more specific error
                }
            }
        );
    },

    applyHeightDataToMesh: function (demPixelData, demWidth, demHeight) {
        const mesh = this.el.getObject3D('mesh'); // Get the THREE.Mesh from the A-Frame entity
        if (!mesh || !mesh.geometry) {
            console.error('DEM Terrain: Mesh or geometry not found on entity.');
            if (this.loaderDiv) this.loaderDiv.style.display = 'none';
            return;
        }

        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        const planeSize = this.data.planeSize;
        const heightScale = this.data.heightScale;

        if (!positions) {
            console.error('DEM Terrain: Position attribute not found on geometry.');
            if (this.loaderDiv) this.loaderDiv.style.display = 'none';
            return;
        }

        console.log(`Applying height data. Vertices: ${positions.count}, DEM: ${demWidth}x${demHeight}`);

        for (let i = 0; i < positions.count; i++) {
            // PlaneGeometry vertices are laid out in X and Y in its local space.
            // When we rotate the <a-entity rotation="-90 0 0">, local Y becomes world Z (height).
            const localX = positions.getX(i);
            const localY = positions.getY(i); // This will become the "depth" or other horizontal axis after rotation

            // Normalize plane coordinates to UV range [0, 1]
            // For a plane centered at (0,0), x goes from -planeSize/2 to +planeSize/2
            let u = (localX / planeSize) + 0.5;
            // Y in PlaneGeometry is typically bottom-to-top, image is top-to-bottom
            let v = 1.0 - ((localY / planeSize) + 0.5); // Invert V

            // Clamp UVs
            u = Math.max(0, Math.min(1, u));
            v = Math.max(0, Math.min(1, v));

            // Map UV to DEM pixel coordinates
            const demX = Math.floor(u * (demWidth - 1));
            const demY = Math.floor(v * (demHeight - 1));

            // Get grayscale value (assuming R channel for grayscale)
            const pixelIndex = (demY * demWidth + demX) * 4;
            const grayscaleValue = demPixelData[pixelIndex] / 255.0; // Normalize 0-1

            // Set the Z position of the vertex (which becomes height due to plane's original orientation)
            // In PlaneGeometry, Z is initially 0. We are modifying it.
            // After the entity is rotated -90 on X, the original Y becomes depth, and Z becomes height.
            // So we modify the original Z component of the PlaneGeometry's vertices.
            positions.setZ(i, grayscaleValue * heightScale);
        }

        positions.needsUpdate = true; // Tell Three.js to update the buffer
        geometry.computeVertexNormals(); // Crucial for correct lighting
        geometry.computeBoundingSphere(); // Good practice

        console.log('DEM Terrain mesh updated.');
        this.el.emit('dem-terrain-loaded', { message: 'DEM terrain processed and mesh updated' }, false);
    },

    // This was more for GLTF models, but good to keep if you switch later
    onModelLoaded: function () {
        // This might be called if the entity was, for example, a glTF model
        // For a plane, the geometry is typically available sooner.
        // If loadDEM was deferred until here, call it now.
        // this.loadDEM();
    },

    remove: function () {
        // Clean up event listeners, etc., if any were added directly to global objects
    }
});