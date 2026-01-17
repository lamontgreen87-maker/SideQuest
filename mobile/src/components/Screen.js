import React from "react";
import { PageContainer } from "./PageContainer";

export default function Screen({ children, style }) {
  return (
    <PageContainer style={style}>
      {children}
    </PageContainer>
  );
}
