/** Dev local apontando direto para a API na EC2 (HTTP; não usar no deploy HTTPS). */
export const environment = {
  production: false,
  apiBaseUrl: 'http://3.141.199.149:8081',
};
