import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      { source: "/api/admin/login",          destination: "/api/admin?_r=login" },
      { source: "/api/admin/dashboard",      destination: "/api/admin?_r=dashboard" },
      { source: "/api/admin/customers",      destination: "/api/admin?_r=customers" },
      { source: "/api/admin/stock",          destination: "/api/admin?_r=stock" },
      { source: "/api/admin/colours",        destination: "/api/admin?_r=colours" },
      { source: "/api/admin/products",       destination: "/api/admin?_r=products" },
      { source: "/api/admin/variants",       destination: "/api/admin?_r=variants" },
      { source: "/api/admin/rooms",          destination: "/api/admin?_r=rooms" },
      { source: "/api/admin/orders",         destination: "/api/admin?_r=orders" },
      { source: "/api/admin/delivery-rates", destination: "/api/admin?_r=delivery-rates" },
      { source: "/api/mpesa/status/:id",     destination: "/api/mpesa/stkpush?_r=status&id=:id" },
      { source: "/api/auth/login",          destination: "/api/auth-custom?_r=login" },
      { source: "/api/auth/logout",         destination: "/api/auth-custom?_r=logout" },
      { source: "/api/auth/me",             destination: "/api/auth-custom?_r=me" },
      { source: "/api/users/create",         destination: "/api/users?_r=create" },
      { source: "/api/users/update",         destination: "/api/users?_r=update" },
      { source: "/api/users/delete",         destination: "/api/users?_r=delete" },
    ];
  },
};

export default nextConfig;
