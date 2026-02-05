// import profileImg from "@/public/1-removebg-preview.png"
// import profileImg2 from "@/public/2-removebg-preview.png"
import { Link } from "react-router"

const Logo = (props: any) => {
  return (
    <Link to="/" className="flex items-center text-dark dark:text-light">
      <div className=" w-14 md:w-18 mr-2 md:mr-4 rounded-full roundend-full overflow-hidden border border-solid border-dark dark:border-gray">
        <img src={""} alt="99DEV logo" className="w-full h-auto rounded-full" sizes="20vw" />   {/* props.mode === "dark" ? profileImg2 : profileImg */}
      </div>
    </Link>
  )
}

export default Logo