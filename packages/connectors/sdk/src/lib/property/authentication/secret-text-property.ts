import * as z from "zod/mini";
import { BaseConnectorAuthSchema } from "./common";
import { TPropertyValue } from "../input/common";
import { PropertyType } from "../input/property-type";

export const SecretTextProperty = z.object({
    ...BaseConnectorAuthSchema.shape,
    ...TPropertyValue(z.object({
        auth: z.string()
    }), PropertyType.SECRET_TEXT).shape,
})


export type SecretTextProperty<R extends boolean> =
    BaseConnectorAuthSchema<string> &
    TPropertyValue<
        string,
        PropertyType.SECRET_TEXT,
        R
    >;
