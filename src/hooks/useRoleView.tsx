import React, { createContext, useContext, useState, ReactNode } from 'react';

type RoleView = 'admin' | 'sales_manager' | 'tele_sales' | 'customer_service' | 'view_only' | null;

interface RoleViewContextType {
  viewAsRole: RoleView;
  setViewAsRole: (role: RoleView) => void;
  isViewingAsRole: boolean;
}

const RoleViewContext = createContext<RoleViewContextType | undefined>(undefined);

export function RoleViewProvider({ children }: { children: ReactNode }) {
  const [viewAsRole, setViewAsRole] = useState<RoleView>(null);

  return (
    <RoleViewContext.Provider
      value={{
        viewAsRole,
        setViewAsRole,
        isViewingAsRole: viewAsRole !== null,
      }}
    >
      {children}
    </RoleViewContext.Provider>
  );
}

export function useRoleView() {
  const context = useContext(RoleViewContext);
  if (!context) {
    throw new Error('useRoleView must be used within RoleViewProvider');
  }
  return context;
}
