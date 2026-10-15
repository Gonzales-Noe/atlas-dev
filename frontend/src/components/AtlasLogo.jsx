import React from 'react'
import Box from '@mui/material/Box'
import atlasLogo from '../assets/atlas-logo.png'

export default function AtlasLogo({
  className,
  style,
  sx,
  alt = 'ATLAS Logo',
  size,
  height = size ?? 36,
  ...props
}) {
  return (
    <Box
      component="img"
      src={atlasLogo}
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
