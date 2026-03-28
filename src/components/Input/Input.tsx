import { Input } from "@/src/components/ui/input"

const CustomInput = (props: React.ComponentProps<typeof Input>) => {
    return (
        <Input {...props} />
    )
}

export default CustomInput