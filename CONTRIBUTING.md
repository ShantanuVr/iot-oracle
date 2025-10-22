# Contributing to IoT Oracle

Thank you for your interest in contributing to IoT Oracle! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ 
- Docker and Docker Compose
- Git
- Basic understanding of TypeScript and IoT concepts

### Development Setup

1. **Fork and clone**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/iot-oracle.git
   cd iot-oracle
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Setup environment**:
   ```bash
   cp env.example .env
   # Edit .env with your local configuration
   ```

4. **Start development environment**:
   ```bash
   docker-compose up -d
   npm run db:migrate
   npm run db:seed
   ```

5. **Start development server**:
   ```bash
   npm run dev
   ```

## 📝 How to Contribute

### Types of Contributions

- 🐛 **Bug fixes**: Fix issues and improve stability
- ✨ **New features**: Add new functionality
- 📚 **Documentation**: Improve docs and examples
- 🧪 **Tests**: Add test coverage
- 🔧 **Infrastructure**: Improve build, CI/CD, deployment

### Workflow

1. **Create an issue** (for bugs or feature requests)
2. **Fork the repository**
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes**
5. **Add tests** for new functionality
6. **Run tests**:
   ```bash
   npm test
   npm run lint
   ```
7. **Commit your changes**:
   ```bash
   git commit -m "feat: add amazing feature"
   ```
8. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
9. **Create a Pull Request**

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:
```
feat(api): add new endpoint for site statistics
fix(aggregation): resolve Merkle tree calculation bug
docs(readme): update installation instructions
```

## 🧪 Testing

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Test Structure

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test API endpoints and database operations
- **End-to-end tests**: Test complete workflows

### Writing Tests

```typescript
describe('Feature Name', () => {
  test('should do something specific', () => {
    // Arrange
    const input = { /* test data */ };
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

## 📋 Code Standards

### TypeScript

- Use strict TypeScript configuration
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Add JSDoc comments for public APIs

### Code Style

- Use ESLint configuration provided
- Follow existing code patterns
- Use meaningful variable and function names
- Keep functions small and focused

### Database

- Use Prisma for all database operations
- Add migrations for schema changes
- Include seed data for new features
- Test database operations

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

1. **Environment**: OS, Node.js version, Docker version
2. **Steps to reproduce**: Clear, numbered steps
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Logs**: Relevant error messages or logs
6. **Screenshots**: If applicable

### Feature Requests

For feature requests, please include:

1. **Use case**: Why is this feature needed?
2. **Proposed solution**: How should it work?
3. **Alternatives**: Other approaches considered
4. **Additional context**: Any other relevant information

## 🔍 Code Review Process

### For Contributors

- Ensure all tests pass
- Update documentation if needed
- Follow code style guidelines
- Respond to review feedback promptly

### For Reviewers

- Check functionality and edge cases
- Verify test coverage
- Ensure code follows standards
- Provide constructive feedback

## 📚 Documentation

### Types of Documentation

- **API Documentation**: Endpoint descriptions and examples
- **Architecture Docs**: System design and data flow
- **User Guides**: Setup and usage instructions
- **Developer Docs**: Contributing and development guides

### Writing Documentation

- Use clear, concise language
- Include code examples
- Keep documentation up-to-date
- Use markdown formatting consistently

## 🚀 Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):
- `MAJOR`: Breaking changes
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes (backward compatible)

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release tag
4. Publish to npm (if applicable)
5. Update Docker images

## 💬 Community

### Getting Help

- 📖 Check the [documentation](docs/)
- 🐛 Search [existing issues](https://github.com/shantanuvr/iot-oracle/issues)
- 💬 Start a [discussion](https://github.com/shantanuvr/iot-oracle/discussions)

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the [Contributor Covenant](https://www.contributor-covenant.org/)

## 🎯 Project Goals

### Primary Goals

- **Reliability**: Deterministic, reproducible data processing
- **Security**: Cryptographic verification and audit trails
- **Performance**: Efficient aggregation and API responses
- **Usability**: Clear APIs and comprehensive documentation

### Long-term Vision

- Support for multiple blockchain networks
- Advanced analytics and reporting
- Integration with more IoT platforms
- Enhanced monitoring and alerting

Thank you for contributing to IoT Oracle! 🎉
