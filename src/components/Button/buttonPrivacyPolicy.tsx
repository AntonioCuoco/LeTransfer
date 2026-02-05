const PrivacyPolicyButton = () => {
  const handleClick = () => {
    window.open("https://www.iubenda.com/privacy-policy/86358183", "_blank");
  };

  return (
    <button 
      onClick={handleClick} 
      className="text-light border border-solid border-light px-4 py-2 rounded-md"
      title="Privacy Policy"
    >
      Privacy Policy
    </button>
  );
};

export default PrivacyPolicyButton;
