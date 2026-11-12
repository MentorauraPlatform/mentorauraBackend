import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const SKILLS_BY_CATEGORY: Record<string, string[]> = {
  'Programming Languages': [
    'JavaScript',
    'TypeScript',
    'Python',
    'Java',
    'C',
    'C++',
    'C#',
    'Go',
    'Rust',
    'PHP',
    'Ruby',
    'Swift',
    'Kotlin',
    'Dart',
    'Scala',
    'Elixir',
    'R',
    'SQL',
    'Bash / Shell Scripting',
  ],

  'Frontend Development': [
    'React',
    'Next.js',
    'Vue.js',
    'Nuxt.js',
    'Angular',
    'Svelte',
    'HTML5',
    'CSS3 / Sass',
    'Tailwind CSS',
    'Bootstrap',
    'Redux',
    'Zustand',
    'React Query / TanStack Query',
    'GraphQL Client (Apollo/Urql)',
    'Webpack / Vite',
    'Web Performance Optimization',
    'Responsive Web Design',
    'Web Accessibility (a11y)',
  ],

  'Backend & APIs': [
    'Node.js',
    'Express.js',
    'NestJS',
    'FastAPI',
    'Django',
    'Flask',
    'Spring Boot',
    '.NET Core',
    'Laravel',
    'Ruby on Rails',
    'RESTful API Design',
    'GraphQL',
    'gRPC',
    'WebSockets',
    'Microservices Architecture',
    'Event-Driven Architecture',
    'System Design',
    'API Gateway & Rate Limiting',
  ],

  'Databases & Caching': [
    'PostgreSQL',
    'MySQL',
    'MongoDB',
    'Redis',
    'SQLite',
    'Elasticsearch',
    'Prisma ORM',
    'TypeORM',
    'Mongoose',
    'Cassandra',
    'DynamoDB',
    'Supabase',
    'Firebase / Firestore',
    'Database Design & Normalization',
    'SQL Query Optimization & Indexing',
  ],

  'DevOps, Cloud & Infrastructure': [
    'Docker',
    'Kubernetes',
    'Amazon Web Services (AWS)',
    'Google Cloud Platform (GCP)',
    'Microsoft Azure',
    'Terraform',
    'Ansible',
    'CI/CD Pipelines',
    'GitHub Actions',
    'GitLab CI',
    'Jenkins',
    'Linux Administration',
    'Nginx',
    'Prometheus & Grafana',
    'Monitoring & Logging (ELK/Datadog)',
    'Site Reliability Engineering (SRE)',
    'Serverless Architecture',
  ],

  'Mobile Development': [
    'React Native',
    'Flutter',
    'iOS Development (Swift/SwiftUI)',
    'Android Development (Kotlin/Jetpack)',
    'Cross-Platform Mobile Dev',
    'Mobile UI/UX',
    'App Store & Play Store Deployment',
  ],

  'AI, Machine Learning & Data': [
    'Machine Learning',
    'Deep Learning',
    'Artificial Intelligence (AI)',
    'Natural Language Processing (NLP)',
    'Large Language Models (LLMs)',
    'Generative AI',
    'Prompt Engineering',
    'Retrieval-Augmented Generation (RAG)',
    'Computer Vision',
    'PyTorch',
    'TensorFlow',
    'Scikit-Learn',
    'Data Analysis & Visualization',
    'Pandas & NumPy',
    'Data Engineering',
    'Apache Spark',
    'Apache Kafka',
    'Snowflake',
    'Databricks',
    'Tableau',
    'Power BI',
    'Statistics & Probability',
    'A/B Testing & Experimentation',
  ],

  'Cybersecurity & Networking': [
    'Cybersecurity Fundamentals',
    'Web Application Security (OWASP)',
    'Penetration Testing & Ethical Hacking',
    'Authentication & Authorization (OAuth2, JWT)',
    'Cryptography & PKI',
    'Network Security & Firewalls',
    'Identity & Access Management (IAM)',
    'Security Auditing & Compliance',
  ],

  'Product, Design & UX': [
    'Product Management',
    'UI Design',
    'UX Design',
    'UX Research',
    'Figma',
    'Wireframing & Prototyping',
    'Design Systems',
    'User Journey Mapping',
    'Product Strategy & Roadmapping',
    'Agile & Scrum Methodologies',
    'Kanban',
    'Product Analytics (Mixpanel, Amplitude)',
  ],

  'Career & Professional Growth': [
    'Technical Leadership',
    'Engineering Management',
    'System Design Interviews',
    'Coding Interview Prep (LeetCode)',
    'Behavioral Interview Preparation',
    'Resume & CV Review',
    'LinkedIn Profile Optimization',
    'Portfolio Review',
    'Career Transitioning',
    'Salary & Offer Negotiation',
    'Mentoring & Coaching',
    'Technical Onboarding',
  ],

  'Soft Skills & Communication': [
    'Effective Communication',
    'Public Speaking & Presenting',
    'Technical Writing & Documentation',
    'Team Collaboration',
    'Cross-Functional Leadership',
    'Conflict Resolution',
    'Time Management & Productivity',
    'Emotional Intelligence (EQ)',
    'Giving & Receiving Feedback',
    'Critical Thinking & Problem Solving',
  ],

  'Business, Startups & Marketing': [
    'Startup Strategy & MVP Building',
    'Fundraising & Pitch Decks',
    'Product-Market Fit',
    'Go-to-Market Strategy (GTM)',
    'Search Engine Optimization (SEO)',
    'Content Marketing',
    'Growth Hacking',
    'Customer Discovery & User Interviews',
  ],

  'Emerging Technologies': [
    'Web3 & Blockchain',
    'Solidity & Smart Contracts',
    'Internet of Things (IoT)',
    'Embedded Systems & C',
    'Game Development (Unity/Unreal)',
    'AR / VR Development',
  ],
};

async function main() {
  console.log('🌱 Starting skills seed...');

  // Flatten and deduplicate all skill names
  const allSkillNames = Array.from(
    new Set(Object.values(SKILLS_BY_CATEGORY).flat().map((s) => s.trim()))
  ).sort();

  console.log(`📋 Found ${allSkillNames.length} unique skills across ${Object.keys(SKILLS_BY_CATEGORY).length} categories.`);

  // 1 single query to fetch existing skill names
  const existingRecords = await prisma.skill.findMany({
    select: { name: true },
  });
  const existingNames = new Set(existingRecords.map((s) => s.name));

  const toCreate = allSkillNames.filter((name) => !existingNames.has(name));

  console.log(`🔍 Existing in database: ${existingNames.size}`);
  console.log(`📦 New skills to insert: ${toCreate.length}`);

  if (toCreate.length > 0) {
    // Bulk insert with skipDuplicates
    const result = await prisma.skill.createMany({
      data: toCreate.map((name) => ({ name })),
      skipDuplicates: true,
    });
    console.log(`✨ Successfully inserted ${result.count} skills.`);
  } else {
    console.log('✨ All skills are already present in the database.');
  }

  const totalInDb = await prisma.skill.count();
  console.log(`📊 Total skills now in database: ${totalInDb}`);
}

main()
  .catch((e) => {
    console.error('❌ Failed to seed skills:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
