import { getApiPath } from '../../utils/api';

interface GraphQLResponse<T> {
  data: T;
  error?: string;
}

interface GraphQLVariables {
  [key: string]: any;
}

class GraphQLClient {
  private async request<T>(
    query: string,
    variables?: GraphQLVariables
  ): Promise<GraphQLResponse<T>> {
    const url = getApiPath('/api/graphql');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    return result;
  }

  async mutate<T>(
    mutation: string | { query: string; variables?: GraphQLVariables },
    variables?: GraphQLVariables
  ): Promise<T> {
    let query: string;
    let vars: GraphQLVariables | undefined;
    
    if (typeof mutation === 'string') {
      query = mutation;
      vars = variables;
    } else {
      query = mutation.query;
      vars = mutation.variables || variables;
    }
    
    const response = await this.request<T>(query, vars);
    return response.data;
  }

  async query<T>(
    query: string | { query: string; variables?: GraphQLVariables },
    variables?: GraphQLVariables
  ): Promise<T> {
    let q: string;
    let vars: GraphQLVariables | undefined;
    
    if (typeof query === 'string') {
      q = query;
      vars = variables;
    } else {
      q = query.query;
      vars = query.variables || variables;
    }
    
    const response = await this.request<T>(q, vars);
    return response.data;
  }
}

export const graphqlClient = new GraphQLClient();

// GraphQL мутации и запросы
export const progressMutations = {
  updateProgress: (day: number, count: number | null, completedItems?: number[]) => ({
    query: `
      mutation UpdateProgress($day: Int!, $count: Int, $completedItems: [Int]) {
        updateProgress(day: $day, count: $count, completedItems: $completedItems) {
          day
          count
          completedItems
          success
        }
      }
    `,
    variables: {
      day,
      count: count === null ? null : count,
      completedItems: completedItems || null
    }
  }),
};

export const progressQueries = {
  getDayProgress: (day: number) => ({
    query: `
      query GetDayProgress($day: Int!) {
        getDayProgress(day: $day) {
          day
          count
        }
      }
    `,
    variables: { day }
  }),
};

