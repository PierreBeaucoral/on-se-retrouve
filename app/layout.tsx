import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"On se retrouve · Vos week-ends en France",description:"Comparez les destinations et les temps de trajet de votre groupe, en voiture et en train.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="fr"><body>{children}</body></html>}
