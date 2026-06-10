/* ═══════════════════════════════════════════════════════
   DADO D20 3D — Three.js r128
   Animación realista con rebotes y rotación con inercia
   Expone: window._RPG.rollDice3D(result, onComplete)
   ════════════════════════════════════════════════════ */

window._RPG = window._RPG || {};

window._RPG.rollDice3D = (function () {

  // Caras del icosaedro — mapeo de índice de cara → número D20
  // Three.js IcosahedronGeometry tiene 20 caras triangulares
  const FACE_NUMBERS = [
    20, 1, 14, 7, 17, 3, 12, 9, 18, 5,
    16, 4, 11, 8, 19, 2, 13, 6, 15, 10
  ];

  // Precomputar la normal de cada cara para saber cuál apunta arriba
  function getFaceNormals(geometry) {
    const pos = geometry.attributes.position;
    const normals = [];
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i),   ay = pos.getY(i),   az = pos.getZ(i);
      const bx = pos.getX(i+1), by = pos.getY(i+1), bz = pos.getZ(i+1);
      const cx = pos.getX(i+2), cy = pos.getY(i+2), cz = pos.getZ(i+2);
      const nx = (ax + bx + cx) / 3;
      const ny = (ay + by + cy) / 3;
      const nz = (az + bz + cz) / 3;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
      normals.push(new THREE.Vector3(nx/len, ny/len, nz/len));
    }
    return normals;
  }

  // Calcular rotación necesaria para que la cara con `targetNumber` apunte hacia arriba
  function getRotationForFace(faceNormals, targetNumber) {
    const faceIdx = FACE_NUMBERS.indexOf(targetNumber);
    if (faceIdx === -1) return new THREE.Euler(0, 0, 0);
    const normal = faceNormals[faceIdx];
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(normal, up);
    return new THREE.Euler().setFromQuaternion(quat);
  }

  // Easing
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBounce(t) {
    if (t < 1/2.75)      return 7.5625 * t * t;
    else if (t < 2/2.75) { t -= 1.5/2.75;   return 7.5625*t*t + 0.75; }
    else if (t < 2.5/2.75){ t -= 2.25/2.75; return 7.5625*t*t + 0.9375; }
    else                  { t -= 2.625/2.75; return 7.5625*t*t + 0.984375; }
  }

  return function rollDice3D(result, onComplete) {
    const overlay = document.getElementById('dice-overlay');
    const numberEl = document.getElementById('dice-number');
    const detailEl = document.getElementById('dice-detail');
    if (!overlay) { if (onComplete) onComplete(); return; }

    // Ocultar número mientras anima
    if (numberEl) numberEl.style.opacity = '0';
    if (detailEl) detailEl.style.opacity = '0';
    overlay.classList.add('active');

    // Contenedor canvas
    let canvasWrap = document.getElementById('dice3d-canvas-wrap');
    if (!canvasWrap) {
      canvasWrap = document.createElement('div');
      canvasWrap.id = 'dice3d-canvas-wrap';
      canvasWrap.style.cssText = [
        'position:absolute', 'top:50%', 'left:50%',
        'transform:translate(-50%,-60%)',
        'width:220px', 'height:220px',
        'pointer-events:none', 'z-index:2'
      ].join(';');
      overlay.appendChild(canvasWrap);
    }
    canvasWrap.innerHTML = '';
    canvasWrap.style.display = 'block';

    // Three.js setup
    const W = 220, H = 220;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    canvasWrap.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 5);

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffd700, 1.2);
    dirLight.position.set(2, 4, 3);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x8b4513, 0.6);
    rimLight.position.set(-3, -1, -2);
    scene.add(rimLight);

    // Geometría D20
    const geo = new THREE.IcosahedronGeometry(1.3, 0);
    const faceNormals = getFaceNormals(geo);

    // Material — piedra oscura con borde dorado
    const mat = new THREE.MeshPhongMaterial({
      color: 0x1a1008,
      emissive: 0x0a0500,
      specular: 0xffd700,
      shininess: 80,
      flatShading: true,
    });

    const dice = new THREE.Mesh(geo, mat);
    scene.add(dice);

    // Rotación destino
    const targetEuler = getRotationForFace(faceNormals, result || 20);

    // Parámetros de animación
    const TOTAL_DURATION = 2200; // ms
    const BOUNCE_END     = 1600;
    const SPIN_ROUNDS    = 4;    // vueltas completas durante el lanzamiento

    // Rotación inicial aleatoria rápida
    const startRot = new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    dice.rotation.copy(startRot);

    // Posición Y — simulación de rebote
    const bounceKeyframes = [
      { t: 0,    y: 2.5  },
      { t: 0.35, y: -0.1 },
      { t: 0.50, y: 0.7  },
      { t: 0.65, y: -0.05},
      { t: 0.75, y: 0.25 },
      { t: 0.85, y: 0    },
      { t: 1.0,  y: 0    },
    ];

    function sampleBounce(progress) {
      const p = Math.min(progress, 1);
      for (let i = 0; i < bounceKeyframes.length - 1; i++) {
        const a = bounceKeyframes[i], b = bounceKeyframes[i+1];
        if (p >= a.t && p <= b.t) {
          const local = (p - a.t) / (b.t - a.t);
          return a.y + (b.y - a.y) * easeOutCubic(local);
        }
      }
      return 0;
    }

    let startTime = null;
    let finished  = false;

    function animate(ts) {
      if (finished) return;
      if (!startTime) startTime = ts;
      const elapsed  = ts - startTime;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);

      // Posición Y rebote
      const bounceProgress = Math.min(elapsed / BOUNCE_END, 1);
      dice.position.y = sampleBounce(bounceProgress);

      // Rotación: spinning → destino
      const spinProgress = Math.min(elapsed / (TOTAL_DURATION * 0.75), 1);
      const eased = easeOutCubic(spinProgress);

      // Interpolar desde startRot + vueltas extras hacia targetEuler
      const spins = SPIN_ROUNDS * Math.PI * 2;
      dice.rotation.x = startRot.x + spins * (1 - eased) + targetEuler.x * eased;
      dice.rotation.y = startRot.y + spins * (1 - eased) + targetEuler.y * eased;
      dice.rotation.z = startRot.z + spins * (1 - eased) + targetEuler.z * eased;

      // Color emissive: brilla al parar
      if (progress > 0.85) {
        const glow = (progress - 0.85) / 0.15;
        mat.emissive.setRGB(glow * 0.5, glow * 0.3, 0);
      }

      renderer.render(scene, camera);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        finished = true;
        // Mostrar número
        setTimeout(() => {
          canvasWrap.style.display = 'none';
          renderer.dispose();
          if (numberEl) {
            numberEl.style.opacity = '1';
            numberEl.style.transition = 'opacity 0.3s';
          }
          if (detailEl) {
            detailEl.style.opacity = '1';
            detailEl.style.transition = 'opacity 0.3s';
          }
          if (onComplete) onComplete();
        }, 300);
      }
    }

    requestAnimationFrame(animate);
  };

})();