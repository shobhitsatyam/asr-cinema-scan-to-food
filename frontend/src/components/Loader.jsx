function Loader({ message = 'Loading...' }) {
  return (
    <div className="screen state-screen">
      <div className="spinner" />
      <p>{message}</p>
    </div>
  );
}

export default Loader;
