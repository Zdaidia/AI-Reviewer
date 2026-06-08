/**
 * 函数分析测试文件
 *
 * 这个文件包含各种类型的函数，用于测试函数分析器
 */

// 简单函数
function simpleFunction(a, b) {
  return a + b;
}

// 异步函数
async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

// 箭头函数
const multiply = (x, y) => x * y;

// 高复杂度函数
function complexFunction(data, options, config, settings, params, extras) {
  if (data && data.length > 0) {
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (item.active) {
        if (options.validate) {
          for (const key in item) {
            if (item.hasOwnProperty(key)) {
              const value = item[key];
              if (value !== null && value !== undefined) {
                if (config.strict) {
                  if (typeof value === 'string') {
                    if (settings.trim) {
                      item[key] = value.trim();
                    }
                  } else if (typeof value === 'number') {
                    if (settings.format) {
                      item[key] = value.toFixed(2);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return data;
}

// 事件处理函数
function handleClick(event) {
  event.preventDefault();
  console.log('Clicked');
}

// CRUD 操作
function createUser(userData) {
  return fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
}

function getUserById(id) {
  return fetch(`/api/users/${id}`);
}

function updateUser(id, updates) {
  return fetch(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
}

function deleteUser(id) {
  return fetch(`/api/users/${id}`, {
    method: 'DELETE'
  });
}

// 验证函数
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function isValidPassword(password) {
  return password && password.length >= 8;
}

// 工具函数
function formatDate(date) {
  return date.toISOString();
}

function parseJSON(jsonString) {
  return JSON.parse(jsonString);
}

// 递归函数
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

// 间接递归
function functionA(n) {
  if (n <= 0) return n;
  return functionB(n - 1);
}

function functionB(n) {
  if (n <= 0) return n;
  return functionA(n - 2);
}

// 类定义
class UserService {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async getAllUsers() {
    return this.apiClient.get('/users');
  }

  async getUserById(id) {
    return this.apiClient.get(`/users/${id}`);
  }

  createUser(userData) {
    return this.apiClient.post('/users', userData);
  }
}

// 导出函数
export function publicFunction(x) {
  return x * 2;
}

// 私有函数（约定）
function _privateHelper(x) {
  return x + 1;
}

// 生命周期函数（React）
function componentDidMount() {
  this.fetchData();
}

function useEffect(effect, deps) {
  // Hook implementation
}

// 状态管理
function setState(newState) {
  Object.assign(this.state, newState);
}

function dispatch(action) {
  return store.reducer(action);
}

// API 调用
async function fetchUserData(userId) {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return data;
}

// 渲染函数
function renderComponent(props) {
  return `<div>${props.content}</div>`;
}

// 构造函数模式
function createPerson(name, age) {
  return {
    name,
    age,
    greet() {
      return `Hello, I'm ${this.name}`;
    }
  };
}
