import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useTheme } from "@/src/contexts/ThemeContext";
import { Button } from "@/src/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      onClick={toggleTheme}
      className="h-9 w-9"
    >
      <SunOutlined className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <MoonOutlined className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}