import { MetadataRoute } from 'next'

const BASE_URL = 'https://img2vid.github.io/bunsanjisho'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  
  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    
  ]
}
