import React, { Suspense, useState, useRef, useMemo } from 'react';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, DragControls, Center, Environment, Html, useProgress } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';

// --- CATALOG DATA ---
const PLATE_LIBRARY = [
  { id: 'p1', name: 'Plate 1', url: '/models/plates/plate1.stl', type: 'plate' },
  { id: 'p2', name: 'Plate 2', url: '/models/plates/plate2.stl', type: 'plate' },
];

const SCREW_LIBRARY = [
  { id: 's1', name: '4.5mm Cortical Screw', url: '/models/screws/screw1.stl', type: 'screw' },
];

// Updated to include multiple fragments for the femur
const BONE_LIBRARY = [
  { 
    id: 'femur_demo', 
    name: 'Femur Demo', 
    fragments: [
      '/models/10_FEMUR_BONE_MESH/Segmentation_Bone.stl',
      '/models/10_FEMUR_BONE_MESH/Segmentation_Bone_2.stl',
      '/models/10_FEMUR_BONE_MESH/Segmentation_Bone_3.stl',
      '/models/10_FEMUR_BONE_MESH/Segmentation_Bone_4.stl',
    ],
    available: true 
  },
];

// --- LOADER COMPONENT ---
function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '100vw', height: '100vh', backgroundColor: '#121212',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        color: '#00BCD4', fontFamily: 'sans-serif', zIndex: 9999
      }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>Loading Workspace...</div>
        <div style={{ fontSize: '18px', color: '#888' }}>{progress.toFixed(0)}%</div>
      </div>
    </Html>
  );
}

// --- BONE FRAGMENT COMPONENT ---
const BoneFragment = ({ url, color, setActiveMesh, appMode, setIsDraggingBone }) => {
  const geometry = useLoader(STLLoader, url);
  const groupRef = useRef();

  // Compute center for internal rotation pivot, but note that in multi-fragment 
  // medical sets, fragments usually share a global origin.
  const center = useMemo(() => {
    geometry.computeBoundingBox();
    geometry.computeVertexNormals(); 
    const vec = new THREE.Vector3();
    geometry.boundingBox.getCenter(vec);
    return vec;
  }, [geometry]);

  return (
    <DragControls 
      disabled={appMode !== 'translate'}
      onDragStart={() => setIsDraggingBone(true)}
      onDragEnd={() => setIsDraggingBone(false)}
    >
      <group 
        ref={groupRef} 
        position={[center.x, center.y, center.z]}
        onPointerDown={(e) => { if (appMode !== 'translate') e.stopPropagation(); }}
        onClick={(e) => {
          e.stopPropagation(); 
          if (appMode === 'rotate') setActiveMesh(groupRef.current);
        }}
        onPointerOver={() => { 
          if (appMode === 'translate') document.body.style.cursor = 'grab';
          else if (appMode === 'rotate') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <mesh name="bone" geometry={geometry} position={[-center.x, -center.y, -center.z]}>
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} emissive={color} emissiveIntensity={0.03} />
        </mesh>
      </group>
    </DragControls>
  );
};

// --- GENERAL HARDWARE COMPONENT ---
const HardwareFragment = ({ url, type, setActiveMesh, appMode, setIsDraggingBone }) => {
  const geometry = useLoader(STLLoader, url);
  const groupRef = useRef();
  const { camera, raycaster, pointer, scene } = useThree(); 
  const [isDragging, setIsDragging] = useState(false);
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const dragTarget = useMemo(() => new THREE.Vector3(), []);
  const lastPointer = useRef(new THREE.Vector2());

  const hardwareColor = type === 'screw' ? '#4fc3f7' : '#a0a4a8';

  const spawnPosition = useMemo(() => {
    geometry.computeVertexNormals(); 
    geometry.center(); 
    const scatterX = (Math.random() - 0.5) * 50;
    const scatterY = (Math.random() - 0.5) * 50;
    return [scatterX, scatterY, 200];
  }, [geometry]);

  useFrame(() => {
    if (isDragging && appMode === 'translate') {
      if (lastPointer.current.x === pointer.x && lastPointer.current.y === pointer.y) return;
      lastPointer.current.copy(pointer);

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      // This "bone" name must match the name given in BoneFragment mesh
      const boneHit = intersects.find(hit => hit.object.name === 'bone');

      if (boneHit) {
        const worldNormal = boneHit.face.normal.clone().transformDirection(boneHit.object.matrixWorld);
        const surfaceOffset = worldNormal.multiplyScalar(type === 'screw' ? 0.5 : 2); 
        groupRef.current.position.copy(boneHit.point).add(surfaceOffset);
      } else {
        raycaster.ray.intersectPlane(dragPlane, dragTarget);
        if (dragTarget) groupRef.current.position.copy(dragTarget);
      }
    }
  });

  return (
    <group 
      ref={groupRef} position={spawnPosition} 
      onPointerDown={(e) => { 
        if (appMode === 'translate') { 
          e.stopPropagation(); 
          setIsDragging(true);
          setIsDraggingBone(true); 
          const cameraDir = camera.getWorldDirection(new THREE.Vector3());
          dragPlane.setFromNormalAndCoplanarPoint(cameraDir.negate(), e.point);
          e.target.setPointerCapture(e.pointerId);
        } 
      }}
      onPointerUp={(e) => {
        if (appMode === 'translate') {
          setIsDragging(false);
          setIsDraggingBone(false); 
          e.target.releasePointerCapture(e.pointerId);
        }
      }}
      onClick={(e) => {
        e.stopPropagation(); 
        if (appMode === 'rotate') setActiveMesh(groupRef.current);
      }}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial color={hardwareColor} roughness={0.2} metalness={0.8} clearcoat={0.5} />
      </mesh>
    </group>
  );
};

// --- THE 3D VIEWER WORKSPACE ---
function Viewer({ onBack }) {
  const [activeMesh, setActiveMesh] = useState(null);
  const [appMode, setAppMode] = useState('orbit'); 
  const [isDraggingWidget, setIsDraggingWidget] = useState(false);
  const [isDraggingBone, setIsDraggingBone] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [coordSpace, setCoordSpace] = useState('local'); 
  const [importedHardware, setImportedHardware] = useState([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState('plates');

  const handleAddHardware = (item) => {
    setImportedHardware((prev) => [...prev, { ...item, instanceId: Date.now() }]);
    setIsLibraryOpen(false); 
  };

  // Find the femur data
  const currentBoneData = useMemo(() => BONE_LIBRARY.find(b => b.id === 'femur_demo'), []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
      
      <button onClick={onBack} style={backBtnStyle}>Return Home</button>

      {isLibraryOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={modalHeaderStyle}>
              <h2 style={{ color: 'white', margin: 0, fontSize: '20px' }}>Hardware Library</h2>
              <button onClick={() => setIsLibraryOpen(false)} style={closeBtnStyle}>×</button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button onClick={() => setLibraryTab('plates')} style={tabStyle(libraryTab === 'plates')}>Plates</button>
              <button onClick={() => setLibraryTab('screws')} style={tabStyle(libraryTab === 'screws')}>Screws</button>
            </div>
            <div style={libraryGridStyle}>
              {(libraryTab === 'plates' ? PLATE_LIBRARY : SCREW_LIBRARY).map((item) => (
                <button key={item.id} onClick={() => handleAddHardware(item)} style={libraryItemStyle}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{item.name}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>Click to insert</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={uiContainerStyle}>
        <div style={{ display: 'flex', gap: '15px', width: '100%' }}>
          <div style={controlGroupStyle}>
            <span style={labelStyle}>Camera</span>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button style={btnStyle(appMode === 'orbit', '#FF9800')} onClick={() => { setAppMode('orbit'); setActiveMesh(null); }}>Orbit</button>
              <button style={btnStyle(appMode === 'pan', '#9C27B0')} onClick={() => { setAppMode('pan'); setActiveMesh(null); }}>Pan</button>
            </div>
          </div>
          <div style={controlGroupStyle}>
            <span style={labelStyle}>Object</span>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button style={btnStyle(appMode === 'translate', '#4CAF50')} onClick={() => { setAppMode('translate'); setActiveMesh(null); }}>Move</button>
              <button style={btnStyle(appMode === 'rotate', '#2196F3')} onClick={() => setAppMode('rotate')}>Rotate</button>
            </div>
          </div>
        </div>

        {appMode === 'rotate' && (
          <div style={rotateOptionsStyle}>
            <button style={helperBtnStyle(snapEnabled)} onClick={() => setSnapEnabled(!snapEnabled)}>Snap 5° {snapEnabled ? 'ON' : 'OFF'}</button>
            <button style={helperBtnStyle(coordSpace === 'local')} onClick={() => setCoordSpace(coordSpace === 'local' ? 'world' : 'local')}>Space: {coordSpace.toUpperCase()}</button>
          </div>
        )}

        <button style={addHardwareBtnStyle} onClick={() => setIsLibraryOpen(true)}>
          ➕ Add Hardware
        </button>
      </div>

      <Canvas shadows camera={{ position: [0, 0, 500], fov: 45 }} onPointerMissed={() => setActiveMesh(null)}>
        <Suspense fallback={<Loader />}>
          <ambientLight intensity={0.4} /> 
          <directionalLight position={[500, 500, 500]} intensity={1.2} />
          <Environment preset="city" />

          {activeMesh && appMode === 'rotate' && (
            <TransformControls 
              object={activeMesh} mode="rotate" space={coordSpace}
              rotationSnap={snapEnabled ? Math.PI / 36 : null} 
              onDraggingChanged={(e) => setIsDraggingWidget(e.value)}
            />
          )}

          {/* Render all fragments for the bone */}
          <Center>
            {currentBoneData?.fragments.map((url) => (
              <BoneFragment 
                key={url}
                url={url} 
                color="#fdfaf0" 
                setActiveMesh={setActiveMesh} 
                appMode={appMode} 
                setIsDraggingBone={setIsDraggingBone} 
              />
            ))}
          </Center>

          {importedHardware.map((item) => (
            <HardwareFragment 
              key={item.instanceId}
              url={item.url} 
              type={item.type}
              setActiveMesh={setActiveMesh} 
              appMode={appMode} 
              setIsDraggingBone={setIsDraggingBone} 
            />
          ))}

          <OrbitControls 
            makeDefault 
            enabled={appMode === 'orbit' || appMode === 'pan' || (appMode === 'translate' && !isDraggingBone) || (appMode === 'rotate' && !isDraggingWidget)} 
            mouseButtons={{ LEFT: appMode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: appMode === 'pan' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN }} 
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home'); 

  if (currentScreen === 'home') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundColor: '#121212', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '100px' }}>
        <h1 style={{ color: '#00BCD4' }}>OrthoTwin</h1>
        <div onClick={() => setCurrentScreen('viewer')} style={boneCardStyle}>
          <h3>Femur Demo</h3>
          <span>Model Ready</span>
        </div>
      </div>
    );
  }

  return <Viewer onBack={() => setCurrentScreen('home')} />;
}

// --- STYLING ---
const backBtnStyle = { position: 'absolute', top: 20, left: 20, zIndex: 10, padding: '10px 15px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' };
const modalOverlayStyle = { position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(8px)' };
const modalContentStyle = { width: '600px', backgroundColor: '#1e1e1e', borderRadius: '12px', padding: '20px', border: '1px solid #444' };
const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' };
const closeBtnStyle = { background: 'none', border: 'none', color: '#ff4444', fontSize: '24px', cursor: 'pointer' };
const libraryGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', maxHeight: '400px', overflowY: 'auto' };
const libraryItemStyle = { backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '15px', color: 'white', cursor: 'pointer', textAlign: 'left' };
const uiContainerStyle = { position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: 'rgba(20, 20, 20, 0.85)', padding: '15px', borderRadius: '12px', border: '1px solid #444', alignItems: 'center' };
const controlGroupStyle = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' };
const labelStyle = { color: '#aaa', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' };
const rotateOptionsStyle = { display: 'flex', gap: '10px', paddingTop: '5px', borderTop: '1px solid #555', width: '100%', justifyContent: 'center' };
const addHardwareBtnStyle = { backgroundColor: '#00BCD4', width: '100%', marginTop: '5px', padding: '10px', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' };
const boneCardStyle = { backgroundColor: '#1e1e1e', border: '1px solid #00BCD4', borderRadius: '12px', padding: '30px 20px', textAlign: 'center', cursor: 'pointer', width: '200px' };

const tabStyle = (isActive) => ({
  flex: 1, padding: '10px', cursor: 'pointer', backgroundColor: isActive ? '#00BCD4' : '#333',
  color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold'
});

const btnStyle = (isActive, activeColor) => ({
  padding: '10px 15px', cursor: 'pointer', border: 'none', borderRadius: '6px',
  backgroundColor: isActive ? activeColor : '#333', color: 'white', fontWeight: 'bold', flex: 1
});

const helperBtnStyle = (isActive) => ({
  fontSize: '11px', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
  border: '1px solid #555', backgroundColor: isActive ? '#eee' : '#222', color: isActive ? '#000' : '#ccc'
});