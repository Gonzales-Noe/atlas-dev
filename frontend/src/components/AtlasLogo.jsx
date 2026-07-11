import React from 'react'
import Box from '@mui/material/Box'

export default function AtlasLogo({
  className,
  style,
  sx,
  alt = 'ATLAS Logo',
  height = 36,
  ...props
}) {
  return (
    <Box
      component="img"
      src="/ATLAS-Logo.svg"
      alt={alt}
      className={className}
      style={style}
      sx={{
        height,
        width: 'auto',
        objectFit: 'contain',
        display: 'block',
        ...sx,
      }}
      {...props}
    />
  )
}
