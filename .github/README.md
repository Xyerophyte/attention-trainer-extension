# CI/CD Pipeline Documentation

This directory contains the continuous integration and deployment configuration for the Attention Trainer Extension.

## 🚀 Pipeline Overview

Our CI/CD pipeline ensures code quality, security, and reliability through automated testing and deployment processes.

### Pipeline Stages

1. **Testing** - Unit, integration, and E2E tests
2. **Building** - Production-ready extension packaging
3. **Security Scanning** - Vulnerability and secret detection
4. **Performance Analysis** - Bundle size and performance metrics
5. **Deployment** - Automated Chrome Web Store publishing

## 📁 File Structure

```
.github/
├── workflows/
│   └── ci.yml              # Main CI/CD pipeline
├── dependabot.yml          # Automated dependency updates
├── pull_request_template.md # PR template for consistent reviews
└── README.md               # This file
```

## 🔄 Workflow Triggers

### Automatic Triggers
- **Push to main/develop**: Full CI pipeline
- **Pull Requests**: Tests, build, and performance analysis
- **Releases**: Full pipeline + Chrome Web Store deployment
- **Scheduled**: Weekly health checks and dependency updates

### Manual Triggers
- **Workflow Dispatch**: Manual pipeline execution
- **Release Creation**: Production deployment

## 🧪 Testing Strategy

### Unit Tests
- **Framework**: Jest with Chrome extension mocking
- **Coverage**: 80%+ line coverage required
- **Scope**: Individual module testing

### Integration Tests
- **Focus**: Component interaction testing
- **Scenarios**: Content script behavioral analysis
- **Environment**: Simulated browser environment

### End-to-End Tests
- **Tool**: Puppeteer with real Chrome browser
- **Scope**: Complete extension workflow
- **Validation**: User interaction simulation

## 🔒 Security Measures

### Automated Security Scanning
- **npm audit**: Dependency vulnerability scanning
- **TruffleHog**: Secret detection in code and builds
- **Custom checks**: Sensitive data in production builds

### Required Secrets
Configure these secrets in your GitHub repository:

```bash
# Chrome Web Store API
CHROME_EXTENSION_ID=your_extension_id
CHROME_CLIENT_ID=your_client_id
CHROME_CLIENT_SECRET=your_client_secret
CHROME_REFRESH_TOKEN=your_refresh_token

# Code Coverage
CODECOV_TOKEN=your_codecov_token

# Notifications (optional)
SLACK_WEBHOOK=your_slack_webhook
```

## 📊 Performance Monitoring

### Bundle Size Analysis
- **Limit**: 5MB (Chrome Web Store requirement)
- **Monitoring**: Automatic size checking in PRs
- **Reporting**: Performance reports generated

### Performance Metrics
- **Memory Usage**: Extension memory footprint
- **Load Time**: Extension initialization time
- **Responsiveness**: UI interaction performance

## 🚢 Deployment Process

### Development Flow
1. **Feature Branch** → Create from develop
2. **Pull Request** → Tests and reviews
3. **Merge to Develop** → Staging deployment
4. **Release** → Production deployment

### Production Deployment
1. **Create Release** → Triggers production pipeline
2. **Build & Test** → All tests must pass
3. **Security Scan** → No vulnerabilities allowed
4. **Chrome Web Store** → Automated publishing

## 🔧 Local Development

### Setup Testing Environment
```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Check code quality
npm run lint
npm run security:audit

# Build for testing
npm run build
npm run test:performance
```

### Pre-commit Checklist
- [ ] All tests pass locally
- [ ] Linting passes
- [ ] No security vulnerabilities
- [ ] Bundle size within limits
- [ ] Extension functionality verified

## 📈 Monitoring & Alerts

### Health Checks
- **Frequency**: Weekly scheduled runs
- **Coverage**: Full test suite execution
- **Alerts**: Slack notifications on failures

### Dependency Updates
- **Automation**: Dependabot weekly updates
- **Security**: Automatic security fixes
- **Testing**: Full test suite on updates

## 🛠 Maintenance

### Pipeline Updates
- Review and update dependencies quarterly
- Monitor for new security scanning tools
- Optimize build times and resource usage

### Troubleshooting

#### Common Issues

**Tests Failing in CI but Pass Locally**
- Check Node.js version compatibility
- Verify environment variables
- Review browser compatibility

**Build Size Exceeding Limits**
- Run `npm run analyze` for bundle analysis
- Review performance recommendations
- Consider code splitting

**Chrome Web Store Deployment Failing**
- Verify API credentials
- Check extension manifest validity
- Review Chrome Web Store policies

#### Debug Commands
```bash
# Analyze bundle size
npm run analyze

# Run tests with verbose output
npm test -- --verbose

# Check security issues
npm run security:audit

# Validate extension
npm run build && npm run validate
```

## 📞 Support

For pipeline issues or questions:
- Create an issue in the repository
- Check existing workflow runs for errors
- Review this documentation

## 🔗 Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Chrome Web Store Developer Policies](https://developer.chrome.com/docs/webstore/program_policies/)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [Puppeteer E2E Testing](https://pptr.dev/)

---

*Last updated: 2024-01-15*
