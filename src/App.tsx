import { useDeviceType,} from './patterns/use-device-type.hook';

function App() {
  const { deviceType, isMobile, isTablet, isDesktop } = useDeviceType();

  return (
    <div>
      <h1>Current device: {deviceType}</h1>

      {isMobile && <h2>Mobile</h2>}
      {isTablet && <h2>Tablet</h2>}
      {isDesktop && <h2>Desktop</h2>}
    </div>
  );
}

export default App;